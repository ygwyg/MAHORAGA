/**
 * Shared types for the leaderboard worker.
 *
 * D1 row interfaces match the schema in db/schema.sql.
 * D1 returns numbers as number, booleans as 0|1, and NULLs as null.
 */

// ---------------------------------------------------------------------------
// D1 Row Types (match db/schema.sql)
// ---------------------------------------------------------------------------

export interface TraderDbRow {
  id: string;
  username: string;
  github_repo: string;
  asset_class: string;
  joined_at: string;
  last_synced_at: string | null;
  is_active: number;   // 0 | 1
  sync_tier: number;
  last_trade_at: string | null;
}

export interface OAuthTokenDbRow {
  trader_id: string;
  access_token_encrypted: string;
  alpaca_account_id: string | null;
  /** Account equity at OAuth connection time. Used for fairness validation. */
  initial_equity: number | null;
  connected_at: string;
  last_used_at: string | null;
}

export interface SnapshotDbRow {
  id: string;
  trader_id: string;
  snapshot_date: string;
  equity: number;
  cash: number;
  total_deposits: number;
  total_pnl: number;
  total_pnl_pct: number;
  unrealized_pnl: number;
  realized_pnl: number;
  day_pnl: number;
  num_trades: number;
  num_winning_trades: number;
  win_rate: number | null;
  max_drawdown_pct: number | null;
  sharpe_ratio: number | null;
  open_positions: number;
  composite_score: number | null;
}

export interface EquityHistoryDbRow {
  id: string;
  trader_id: string;
  timestamp: string;
  equity: number;
  profit_loss: number;
  profit_loss_pct: number;
}

export interface TradeDbRow {
  id: string;
  trader_id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  filled_at: string;
  asset_class: string;
}

// ---------------------------------------------------------------------------
// Joined / Projected Row Types (query results)
// ---------------------------------------------------------------------------

/** Leaderboard query result: trader fields + latest snapshot fields. */
export interface LeaderboardDbRow {
  id: string;
  username: string;
  github_repo: string;
  asset_class: string;
  joined_at: string;
  equity: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_deposits: number;
  sharpe_ratio: number | null;
  win_rate: number | null;
  max_drawdown_pct: number | null;
  num_trades: number;
  composite_score: number | null;
  open_positions: number;
  snapshot_date: string;
}

/** Trader + token join used by queue consumer and manual sync. */
export interface TraderWithTokenRow {
  id: string;
  username: string;
  sync_tier: number;
  is_active: number;
  access_token_encrypted: string | null;
}

/** Stale trader row used by cron re-enqueue. */
export interface StaleTraderRow {
  id: string;
  sync_tier: number;
}

/** Aggregate stats query result. */
export interface StatsDbRow {
  total_traders: number;
}

/** Normalization ranges for composite score calculation. */
export interface ScoreRangesRow {
  roi_min: number | null;
  roi_max: number | null;
  sharpe_min: number | null;
  sharpe_max: number | null;
  wr_min: number | null;
  wr_max: number | null;
  imdd_min: number | null;
  imdd_max: number | null;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface SyncMessage {
  traderId: string;
}
