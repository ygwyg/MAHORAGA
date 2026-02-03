/**
 * Financial metric calculations for the leaderboard.
 *
 * All calculations use daily equity values from Alpaca's portfolio history
 * endpoint (GET /v2/account/portfolio/history?timeframe=1D).
 *
 * These metrics feed into the composite score that ranks traders:
 *   - ROI % (40% weight): Raw return on investment vs. starting capital
 *   - Sharpe Ratio (30% weight): Risk-adjusted return quality
 *   - Win Rate (15% weight): Consistency of profitable trading days
 *   - Inverse Max Drawdown (15% weight): Capital preservation
 *
 * Excluded metrics and reasoning:
 * - Sortino ratio: requires separating downside deviation, marginal value
 *   over Sharpe for a paper trading leaderboard.
 * - Profit factor: requires pairing individual buy/sell trades, which is
 *   complex with partial fills and multiple entries/exits.
 * - Average trade duration: same pairing complexity as profit factor.
 */

/**
 * Annualized Sharpe ratio from daily equity values.
 *
 * The Sharpe ratio measures risk-adjusted return: how much excess return
 * you earn per unit of volatility. A higher Sharpe means better returns
 * relative to the risk taken. This prevents reckless all-in bets from
 * ranking well — even with high ROI, wild swings produce a low Sharpe.
 *
 * Formula:
 *   daily_returns[i] = (equity[i] - equity[i-1]) / equity[i-1]
 *   daily_rf = annual_rf / 252  (daily risk-free rate)
 *   sharpe = (mean(daily_returns) - daily_rf) / stddev(daily_returns) * sqrt(252)
 *
 * Key details:
 *   - Uses SAMPLE standard deviation (n-1 divisor, Bessel's correction)
 *     for an unbiased estimate from a sample of trading days.
 *   - Annualized by multiplying by sqrt(252), the standard number of
 *     US equity trading days per year.
 *   - Risk-free rate default: 5% annual (approximate US T-bill yield).
 *   - Requires 5+ days of data to produce a meaningful result. Fewer
 *     days yield unreliable statistics and return null.
 *   - Returns null if standard deviation is 0 (no volatility = undefined ratio).
 *
 * Interpretation:
 *   < 0:   Losing money after adjusting for risk-free rate
 *   0-1:   Below-average risk-adjusted returns
 *   1-2:   Good risk-adjusted returns
 *   2-3:   Very good
 *   > 3:   Excellent (rare in live trading, more common in paper)
 */
export function calcSharpeRatio(
  dailyEquity: number[],
  riskFreeAnnual = 0.05
): number | null {
  if (dailyEquity.length < 5) return null;

  // Calculate daily returns as percentage change between consecutive days
  const returns: number[] = [];
  for (let i = 1; i < dailyEquity.length; i++) {
    if (dailyEquity[i - 1] <= 0) continue; // skip invalid data points
    returns.push((dailyEquity[i] - dailyEquity[i - 1]) / dailyEquity[i - 1]);
  }

  if (returns.length < 4) return null;

  // Convert annual risk-free rate to daily equivalent
  const dailyRf = riskFreeAnnual / 252;

  // Mean daily return
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

  // Sample variance (n-1 divisor for Bessel's correction)
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Zero volatility = undefined Sharpe (division by zero)
  if (stdDev === 0) return null;

  // Annualize: multiply by sqrt(trading days per year)
  return ((mean - dailyRf) / stdDev) * Math.sqrt(252);
}

/**
 * Maximum drawdown as a percentage (0 to 100).
 *
 * Measures the largest peak-to-trough decline in the equity curve.
 * This answers: "What was the worst losing streak?" — the maximum
 * percentage the account fell from its highest point before recovering.
 *
 * Formula:
 *   For each day, track the running peak (highest equity seen so far).
 *   drawdown[i] = (peak - equity[i]) / peak * 100
 *   max_drawdown = max(drawdown[i]) for all i
 *
 * Example:
 *   Equity: $100k → $120k → $96k → $130k
 *   Peak at $120k, trough at $96k → drawdown = (120k-96k)/120k = 20%
 *   Even though the account recovered to $130k, the max drawdown is 20%.
 *
 * Returns a positive number (0 = no drawdown, 100 = total loss).
 * Lower is better — it means the trader preserved capital well.
 *
 * In the composite score, this is inverted (100 - max_drawdown) so that
 * lower drawdowns score higher.
 */
export function calcMaxDrawdown(dailyEquity: number[]): number {
  if (dailyEquity.length < 2) return 0;

  let peak = dailyEquity[0];
  let maxDd = 0;

  for (const eq of dailyEquity) {
    if (eq > peak) peak = eq;       // new high-water mark
    if (peak > 0) {
      const dd = ((peak - eq) / peak) * 100;
      if (dd > maxDd) maxDd = dd;   // worst decline so far
    }
  }

  return maxDd;
}

/**
 * Win rate based on profitable TRADING DAYS (not individual trades).
 *
 * We deliberately measure winning days rather than winning trades because:
 *   1. It avoids rewarding high-frequency churn (many small trades to
 *      inflate win count while net P&L is negligible).
 *   2. It better reflects overall strategy consistency — did the agent
 *      end each day in profit, regardless of how many trades it made?
 *   3. Alpaca's portfolio history provides clean daily P&L data,
 *      whereas pairing individual trades is complex with partial fills.
 *
 * A "winning day" is any day where the daily P&L > 0.
 * Days with exactly $0 P&L are excluded — these represent weekends,
 * holidays, or days with no market activity (no signal).
 *
 * Requires 2+ active trading days to produce a meaningful result.
 *
 * Returns { rate (0-100), winning, total } or null if insufficient data.
 */
export function calcWinRate(
  dailyPnl: number[]
): { rate: number; winning: number; total: number } | null {
  // Filter out zero-change days (market closed, no activity)
  const activeDays = dailyPnl.filter((pnl) => pnl !== 0);
  if (activeDays.length < 2) return null;

  const winning = activeDays.filter((pnl) => pnl > 0).length;
  return {
    rate: (winning / activeDays.length) * 100,
    winning,
    total: activeDays.length,
  };
}
