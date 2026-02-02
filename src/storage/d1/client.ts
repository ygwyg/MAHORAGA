

export type SqlParam = string | number | boolean | null | ArrayBuffer;

export class D1Client {
  constructor(private db: D1Database) {}

  async execute<T>(
    query: string,
    params: SqlParam[] = []
  ): Promise<T[]> {
    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<T>();
    return result.results;
  }

  async executeOne<T>(
    query: string,
    params: SqlParam[] = []
  ): Promise<T | null> {
    const result = await this.db
      .prepare(query)
      .bind(...params)
      .first<T>();
    return result;
  }

  async run(query: string, params: SqlParam[] = []): Promise<D1Result> {
    return this.db.prepare(query).bind(...params).run();
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.db.batch(statements);
  }

  prepare(query: string): D1PreparedStatement {
    return this.db.prepare(query);
  }
}

export interface ToolLogEntry {
  id: string;
  request_id: string;
  tool_name: string;
  input_hash: string;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
  latency_ms: number | null;
  provider_calls: number;
  created_at: string;
}

export interface RiskStateRow {
  id: number;
  kill_switch_active: number;
  kill_switch_reason: string | null;
  kill_switch_at: string | null;
  daily_loss_usd: number;
  daily_loss_reset_at: string | null;
  last_loss_at: string | null;
  cooldown_until: string | null;
  updated_at: string;
}

export interface OrderApprovalRow {
  id: string;
  preview_hash: string;
  order_params_json: string;
  policy_result_json: string;
  approval_token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface TradeRow {
  id: string;
  approval_id: string | null;
  alpaca_order_id: string;
  symbol: string;
  side: string;
  qty: number;
  order_type: string;
  limit_price: number | null;
  stop_price: number | null;
  status: string;
  filled_qty: number | null;
  filled_avg_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyConfigRow {
  id: number;
  config_json: string;
  updated_at: string;
}

export interface TradeJournalRow {
  id: string;
  trade_id: string | null;
  symbol: string;
  side: string;
  entry_price: number | null;
  entry_at: string | null;
  exit_price: number | null;
  exit_at: string | null;
  qty: number;
  pnl_usd: number | null;
  pnl_pct: number | null;
  hold_duration_mins: number | null;
  signals_json: string | null;
  technicals_json: string | null;
  regime_tags: string | null;
  event_ids: string | null;
  outcome: string | null;
  notes: string | null;
  lessons_learned: string | null;
  created_at: string;
  updated_at: string;
}

export interface StructuredEventRow {
  id: string;
  raw_event_id: string | null;
  event_type: string;
  symbols: string;
  summary: string;
  confidence: number;
  validated: number;
  validation_errors: string | null;
  trade_proposal_id: string | null;
  trade_id: string | null;
  created_at: string;
}

export function createD1Client(db: D1Database): D1Client {
  return new D1Client(db);
}
