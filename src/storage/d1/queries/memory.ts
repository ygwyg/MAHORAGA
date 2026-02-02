import { D1Client, TradeJournalRow } from "../client";
import { generateId, nowISO } from "../../../lib/utils";

interface CreateJournalEntryParams {
  trade_id?: string;
  symbol: string;
  side: string;
  entry_price?: number;
  entry_at?: string;
  qty: number;
  signals?: Record<string, unknown>;
  technicals?: Record<string, unknown>;
  regime_tags?: string[];
  event_ids?: string[];
  notes?: string;
}

export async function createJournalEntry(
  db: D1Client,
  params: CreateJournalEntryParams
): Promise<string> {
  const id = generateId();
  const now = nowISO();

  await db.run(
    `INSERT INTO trade_journal (id, trade_id, symbol, side, entry_price, entry_at, qty, signals_json, technicals_json, regime_tags, event_ids, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.trade_id ?? null,
      params.symbol,
      params.side,
      params.entry_price ?? null,
      params.entry_at ?? now,
      params.qty,
      params.signals ? JSON.stringify(params.signals) : null,
      params.technicals ? JSON.stringify(params.technicals) : null,
      params.regime_tags?.join(",") ?? null,
      params.event_ids?.join(",") ?? null,
      params.notes ?? null,
      now,
      now,
    ]
  );

  return id;
}

interface LogOutcomeParams {
  journal_id: string;
  exit_price: number;
  exit_at?: string;
  pnl_usd: number;
  pnl_pct: number;
  hold_duration_mins: number;
  outcome: "win" | "loss" | "scratch";
  lessons_learned?: string;
}

export async function logOutcome(
  db: D1Client,
  params: LogOutcomeParams
): Promise<void> {
  const now = nowISO();

  await db.run(
    `UPDATE trade_journal 
     SET exit_price = ?, exit_at = ?, pnl_usd = ?, pnl_pct = ?, hold_duration_mins = ?, outcome = ?, lessons_learned = ?, updated_at = ?
     WHERE id = ?`,
    [
      params.exit_price,
      params.exit_at ?? now,
      params.pnl_usd,
      params.pnl_pct,
      params.hold_duration_mins,
      params.outcome,
      params.lessons_learned ?? null,
      now,
      params.journal_id,
    ]
  );
}

export async function queryJournal(
  db: D1Client,
  params: {
    symbol?: string;
    outcome?: string;
    regime_tag?: string;
    limit?: number;
    offset?: number;
  }
): Promise<TradeJournalRow[]> {
  const { symbol, outcome, regime_tag, limit = 50, offset = 0 } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (symbol) {
    conditions.push("symbol = ?");
    values.push(symbol.toUpperCase());
  }
  if (outcome) {
    conditions.push("outcome = ?");
    values.push(outcome);
  }
  if (regime_tag) {
    conditions.push("regime_tags LIKE ?");
    values.push(`%${regime_tag}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);

  return db.execute<TradeJournalRow>(
    `SELECT * FROM trade_journal ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    values
  );
}

export async function getJournalStats(
  db: D1Client,
  params: { symbol?: string; days?: number } = {}
): Promise<{
  total_trades: number;
  wins: number;
  losses: number;
  scratches: number;
  total_pnl: number;
  avg_pnl: number;
  win_rate: number;
  avg_hold_mins: number;
}> {
  const { symbol, days = 30 } = params;
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = `
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN outcome = 'scratch' THEN 1 ELSE 0 END) as scratches,
      COALESCE(SUM(pnl_usd), 0) as total_pnl,
      COALESCE(AVG(pnl_usd), 0) as avg_pnl,
      COALESCE(AVG(hold_duration_mins), 0) as avg_hold_mins
    FROM trade_journal
    WHERE created_at >= ?
  `;
  const values: unknown[] = [dateLimit];

  if (symbol) {
    query += " AND symbol = ?";
    values.push(symbol.toUpperCase());
  }

  const row = await db.executeOne<{
    total_trades: number;
    wins: number;
    losses: number;
    scratches: number;
    total_pnl: number;
    avg_pnl: number;
    avg_hold_mins: number;
  }>(query, values);

  if (!row || row.total_trades === 0) {
    return {
      total_trades: 0,
      wins: 0,
      losses: 0,
      scratches: 0,
      total_pnl: 0,
      avg_pnl: 0,
      win_rate: 0,
      avg_hold_mins: 0,
    };
  }

  return {
    total_trades: row.total_trades,
    wins: row.wins,
    losses: row.losses,
    scratches: row.scratches,
    total_pnl: row.total_pnl,
    avg_pnl: row.avg_pnl,
    win_rate: row.total_trades > 0 ? row.wins / row.total_trades : 0,
    avg_hold_mins: row.avg_hold_mins,
  };
}

interface MemoryRuleRow {
  id: string;
  rule_type: string;
  description: string;
  conditions_json: string | null;
  confidence: number | null;
  source: string;
  active: number;
  created_at: string;
}

export async function getActiveRules(db: D1Client): Promise<MemoryRuleRow[]> {
  return db.execute<MemoryRuleRow>(
    `SELECT * FROM memory_rules WHERE active = 1 ORDER BY created_at DESC`
  );
}

export async function getPreferences(
  db: D1Client
): Promise<Record<string, unknown>> {
  const row = await db.executeOne<{ preferences_json: string }>(
    `SELECT preferences_json FROM memory_preferences WHERE id = 1`
  );
  return row ? JSON.parse(row.preferences_json) : {};
}

export async function setPreferences(
  db: D1Client,
  preferences: Record<string, unknown>
): Promise<void> {
  await db.run(
    `UPDATE memory_preferences SET preferences_json = ?, updated_at = ? WHERE id = 1`,
    [JSON.stringify(preferences), nowISO()]
  );
}
