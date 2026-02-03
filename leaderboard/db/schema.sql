-- MAHORAGA Leaderboard Schema

-- Registered traders
CREATE TABLE IF NOT EXISTS traders (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  github_repo TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'stocks',  -- derived from trade data during sync
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sync_tier INTEGER NOT NULL DEFAULT 4,
  last_trade_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_traders_username ON traders(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_traders_github_repo ON traders(github_repo);
CREATE INDEX IF NOT EXISTS idx_traders_sync_tier ON traders(sync_tier);
-- Partial index: active traders ordered by last_synced_at.
-- Used by reEnqueueStaleTraders cron to efficiently find traders needing re-sync.
-- NULLs sort first (ASC), so never-synced traders are found immediately.
CREATE INDEX IF NOT EXISTS idx_traders_stale_sync ON traders(last_synced_at)
  WHERE is_active = 1;

-- Alpaca OAuth tokens (encrypted at rest via ENCRYPTION_KEY secret)
-- Tokens do not expire per Alpaca docs (no refresh token mechanism).
-- Users can revoke access from their Alpaca dashboard at any time.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  trader_id TEXT PRIMARY KEY REFERENCES traders(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  alpaca_account_id TEXT UNIQUE,           -- dedup: one Alpaca account per leaderboard entry
  -- Account equity at the moment of OAuth connection. Recorded for audit trail
  -- and fairness validation. Alpaca paper accounts can be seeded with any
  -- amount ($1 to $1M). This field tracks what the account equity was at
  -- the time of registration, regardless of the starting seed amount.
  initial_equity REAL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT                        -- last successful API call
);

CREATE INDEX IF NOT EXISTS idx_oauth_alpaca_account ON oauth_tokens(alpaca_account_id);

-- Daily performance snapshots (pulled from Alpaca)
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  equity REAL NOT NULL,
  cash REAL NOT NULL,
  total_deposits REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  total_pnl_pct REAL NOT NULL DEFAULT 0,
  unrealized_pnl REAL NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  day_pnl REAL NOT NULL DEFAULT 0,
  num_trades INTEGER NOT NULL DEFAULT 0,           -- total filled orders (all-time, via pagination)
  num_winning_trades INTEGER NOT NULL DEFAULT 0,   -- count of profitable TRADING DAYS (not individual trades)
  win_rate REAL,                                   -- num_winning_trades / active_trading_days * 100
  max_drawdown_pct REAL,
  sharpe_ratio REAL,
  open_positions INTEGER NOT NULL DEFAULT 0,
  composite_score REAL,
  UNIQUE(trader_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_trader ON performance_snapshots(trader_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON performance_snapshots(snapshot_date);

-- Equity curve (for charts)
CREATE TABLE IF NOT EXISTS equity_history (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  equity REAL NOT NULL,
  profit_loss REAL NOT NULL DEFAULT 0,
  profit_loss_pct REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_equity_trader ON equity_history(trader_id, timestamp DESC);

-- Individual trades (from Alpaca FILL activities)
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  filled_at TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'stocks'
);

CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader_id, filled_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
