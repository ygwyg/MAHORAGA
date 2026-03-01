/**
 * Brier Score Tracker
 *
 * Records MC predictions to D1 and evaluates expired ones against
 * actual price data. Brier score = (predicted_prob - outcome)^2.
 *
 * Lower is better: 0 = perfect, 0.25 = coin flip, 1 = always wrong.
 */

export interface MCPrediction {
  id: string;
  symbol: string;
  predictedProb: number;
  strikePrice: number;
  horizonMs: number;
  currentPriceAtPrediction: number;
}

export interface BrierStats {
  totalPredictions: number;
  evaluatedCount: number;
  pendingCount: number;
  meanBrierScore: number | null;
  recentBrierScore: number | null; // last 30 days
}

/**
 * Record a new MC prediction in D1.
 */
export async function recordPrediction(
  db: D1Database,
  prediction: MCPrediction,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO mc_predictions (id, symbol, predicted_prob, strike_price, horizon_ms, current_price_at_prediction)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      prediction.id,
      prediction.symbol,
      prediction.predictedProb,
      prediction.strikePrice,
      prediction.horizonMs,
      prediction.currentPriceAtPrediction,
    )
    .run();
}

/**
 * Evaluate all expired predictions.
 * Requires a function to fetch the actual price at the prediction's horizon time.
 */
export async function evaluateExpiredPredictions(
  db: D1Database,
  getPrice: (symbol: string, timestampMs: number) => Promise<number | null>,
): Promise<number> {
  const now = Date.now();

  // Find all pending predictions whose horizon has passed
  const pending = await db
    .prepare(
      `SELECT id, symbol, predicted_prob, strike_price, horizon_ms, created_at, current_price_at_prediction
       FROM mc_predictions
       WHERE outcome IS NULL AND (created_at * 1000 + horizon_ms) <= ?`,
    )
    .bind(now)
    .all<{
      id: string;
      symbol: string;
      predicted_prob: number;
      strike_price: number;
      horizon_ms: number;
      created_at: number;
      current_price_at_prediction: number;
    }>();

  if (!pending.results || pending.results.length === 0) return 0;

  let evaluated = 0;

  for (const row of pending.results) {
    const evaluationTime = row.created_at * 1000 + row.horizon_ms;
    const actualPrice = await getPrice(row.symbol, evaluationTime);

    if (actualPrice === null) continue; // Can't evaluate yet, skip

    const outcome = actualPrice > row.strike_price ? 1 : 0;
    const brierScore = (row.predicted_prob - outcome) ** 2;

    await db
      .prepare(
        `UPDATE mc_predictions
         SET outcome = ?, brier_score = ?, evaluated_at = ?, actual_price_at_evaluation = ?
         WHERE id = ?`,
      )
      .bind(outcome, brierScore, Math.floor(now / 1000), actualPrice, row.id)
      .run();

    evaluated++;
  }

  return evaluated;
}

/**
 * Get aggregate Brier score statistics.
 */
export async function getBrierStats(db: D1Database): Promise<BrierStats> {
  const total = await db
    .prepare(`SELECT COUNT(*) as count FROM mc_predictions`)
    .first<{ count: number }>();

  const evalResult = await db
    .prepare(
      `SELECT COUNT(*) as count, AVG(brier_score) as avg_brier
       FROM mc_predictions WHERE outcome IS NOT NULL`,
    )
    .first<{ count: number; avg_brier: number | null }>();

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
  const recentResult = await db
    .prepare(
      `SELECT AVG(brier_score) as avg_brier
       FROM mc_predictions WHERE outcome IS NOT NULL AND evaluated_at >= ?`,
    )
    .bind(thirtyDaysAgo)
    .first<{ avg_brier: number | null }>();

  return {
    totalPredictions: total?.count ?? 0,
    evaluatedCount: evalResult?.count ?? 0,
    pendingCount: (total?.count ?? 0) - (evalResult?.count ?? 0),
    meanBrierScore: evalResult?.avg_brier ?? null,
    recentBrierScore: recentResult?.avg_brier ?? null,
  };
}

/**
 * Get Brier stats per symbol for the last N days.
 */
export async function getBrierBySymbol(
  db: D1Database,
  days = 30,
): Promise<Array<{ symbol: string; count: number; avgBrier: number }>> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const result = await db
    .prepare(
      `SELECT symbol, COUNT(*) as count, AVG(brier_score) as avg_brier
       FROM mc_predictions
       WHERE outcome IS NOT NULL AND evaluated_at >= ?
       GROUP BY symbol
       ORDER BY avg_brier ASC`,
    )
    .bind(since)
    .all<{ symbol: string; count: number; avg_brier: number }>();

  return (result.results ?? []).map((r) => ({
    symbol: r.symbol,
    count: r.count,
    avgBrier: r.avg_brier,
  }));
}
