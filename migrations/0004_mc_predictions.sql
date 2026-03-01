-- Monte Carlo prediction tracking for Brier score calibration
CREATE TABLE IF NOT EXISTS mc_predictions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  predicted_prob REAL NOT NULL,
  strike_price REAL NOT NULL,
  horizon_ms INTEGER NOT NULL,
  outcome INTEGER,  -- 1 = price exceeded strike, 0 = did not, NULL = pending
  brier_score REAL,  -- (predicted_prob - outcome)^2, computed on evaluation
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  evaluated_at INTEGER,
  current_price_at_prediction REAL NOT NULL,
  actual_price_at_evaluation REAL
);

CREATE INDEX IF NOT EXISTS idx_mc_predictions_symbol ON mc_predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_mc_predictions_pending ON mc_predictions(outcome) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_mc_predictions_created ON mc_predictions(created_at);
