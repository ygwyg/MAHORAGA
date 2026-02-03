/**
 * Cron cycle: runs every 15 minutes.
 *
 * 1. Compute composite scores (min-max normalization across all traders)
 * 2. Assign sync tiers based on rank + activity
 * 3. Re-enqueue stale traders (safety net for lost queue messages)
 * 4. Rebuild KV caches (leaderboard + stats)
 */

import { tierDelaySeconds, type SyncTier } from "./tiers";
import {
  setCachedLeaderboard,
  setCachedStats,
  leaderboardCacheKey,
  invalidateLeaderboardCaches,
} from "./cache";
import { queryLeaderboard, queryStats } from "./api";
import type { SyncMessage, StaleTraderRow, ScoreRangesRow } from "./types";

export async function runCronCycle(env: Env): Promise<void> {
  console.log("[cron] Starting cycle");

  // Each step is isolated so a failure in one doesn't skip the rest.
  // E.g., if composite scores fail, tiers/caches/re-enqueue still run.
  try { await computeAndStoreCompositeScores(env); }
  catch (err) { console.error("[cron] computeAndStoreCompositeScores failed:", err instanceof Error ? err.message : err); }

  try { await assignSyncTiers(env); }
  catch (err) { console.error("[cron] assignSyncTiers failed:", err instanceof Error ? err.message : err); }

  try { await reEnqueueStaleTraders(env); }
  catch (err) { console.error("[cron] reEnqueueStaleTraders failed:", err instanceof Error ? err.message : err); }

  try { await rebuildCaches(env); }
  catch (err) { console.error("[cron] rebuildCaches failed:", err instanceof Error ? err.message : err); }

  console.log("[cron] Cycle complete");
}

/**
 * Compute composite scores entirely in SQL (no JS memory / D1 row limits).
 *
 * The composite score is a single 0-100 number that balances four dimensions
 * of trading performance. It's the primary ranking metric for the leaderboard.
 *
 * Weights:
 *   ROI %             (40%) — Raw return on investment. Rewards profitable agents.
 *   Sharpe Ratio      (30%) — Risk-adjusted return. Penalizes reckless gambling
 *                              even if ROI is high — wild volatility tanks Sharpe.
 *   Win Rate          (15%) — Consistency. % of trading days that were profitable.
 *   Inverse Drawdown  (15%) — Capital preservation. (100% - max_drawdown_pct).
 *                              Lower drawdown = higher score. Rewards agents that
 *                              don't blow up their account chasing gains.
 *
 * Normalization: Min-max scaling across the entire trader cohort.
 *   normalized = (value - min) / (max - min), clamped to [0, 1]
 *   This ensures each component contributes proportionally regardless of
 *   absolute scale (e.g., Sharpe ~0-3 vs ROI ~-50% to +200%).
 *
 * Final score: weighted sum * 100, rounded to 1 decimal.
 *   score = (0.4*norm_roi + 0.3*norm_sharpe + 0.15*norm_wr + 0.15*norm_imdd) * 100
 *
 * Edge cases:
 *   - If all traders have the same value for a metric (min = max),
 *     that component contributes 0 to avoid division by zero.
 *   - Traders without Sharpe or Win Rate (too few trading days) get a partial
 *     score using only ROI (72.7%) and inverse drawdown (27.3%). This keeps
 *     the 40:15 ratio between these two components while ensuring traders
 *     with positive ROI rank above those with zero ROI.
 *
 * Implementation: 2 D1 calls regardless of trader count.
 *   Step 1: Aggregate min/max ranges across all traders' latest snapshots.
 *   Step 2: Single UPDATE FROM applies the weighted formula to every snapshot.
 */
export async function computeAndStoreCompositeScores(env: Env): Promise<void> {
  const ranges = await env.DB.prepare(`
    WITH latest AS (
      SELECT ps.total_pnl_pct, ps.sharpe_ratio, ps.win_rate, ps.max_drawdown_pct
      FROM performance_snapshots ps
      INNER JOIN (
        SELECT trader_id, MAX(snapshot_date) as max_date
        FROM performance_snapshots GROUP BY trader_id
      ) l ON ps.trader_id = l.trader_id AND ps.snapshot_date = l.max_date
    )
    SELECT
      MIN(total_pnl_pct)             AS roi_min,
      MAX(total_pnl_pct)             AS roi_max,
      MIN(sharpe_ratio)              AS sharpe_min,
      MAX(sharpe_ratio)              AS sharpe_max,
      MIN(win_rate)                  AS wr_min,
      MAX(win_rate)                  AS wr_max,
      MIN(100.0 - max_drawdown_pct)  AS imdd_min,
      MAX(100.0 - max_drawdown_pct)  AS imdd_max
    FROM latest
  `).first<ScoreRangesRow>();

  if (!ranges || ranges.roi_min === null) return;

  const roiMin  = ranges.roi_min  ?? 0;
  const roiMax  = ranges.roi_max  ?? 0;
  const shMin   = ranges.sharpe_min ?? 0;
  const shMax   = ranges.sharpe_max ?? 0;
  const wrMin   = ranges.wr_min   ?? 0;
  const wrMax   = ranges.wr_max   ?? 0;
  const imddMin = ranges.imdd_min ?? 0;
  const imddMax = ranges.imdd_max ?? 0;

  await env.DB.prepare(`
    WITH latest AS (
      SELECT trader_id, MAX(snapshot_date) AS max_date
      FROM performance_snapshots GROUP BY trader_id
    )
    UPDATE performance_snapshots
    SET composite_score = ROUND((
      -- ROI component (40% weight, or 72.7% if sharpe/wr missing)
      CASE WHEN ?1 = ?2 THEN 0.0
           ELSE MAX(0.0, MIN(1.0, (total_pnl_pct - ?1) / (?2 - ?1)))
      END * CASE WHEN sharpe_ratio IS NULL OR win_rate IS NULL THEN 0.727 ELSE 0.4 END +
      -- Sharpe component (30% weight, or 0% if missing)
      CASE WHEN sharpe_ratio IS NULL OR ?3 = ?4 THEN 0.0
           ELSE MAX(0.0, MIN(1.0, (sharpe_ratio - ?3) / (?4 - ?3))) * 0.3
      END +
      -- Win rate component (15% weight, or 0% if missing)
      CASE WHEN win_rate IS NULL OR ?5 = ?6 THEN 0.0
           ELSE MAX(0.0, MIN(1.0, (win_rate - ?5) / (?6 - ?5))) * 0.15
      END +
      -- Inverse max drawdown component (15% weight, or 27.3% if sharpe/wr missing)
      CASE WHEN ?7 = ?8 THEN 0.0
           ELSE MAX(0.0, MIN(1.0, ((100.0 - max_drawdown_pct) - ?7) / (?8 - ?7)))
      END * CASE WHEN sharpe_ratio IS NULL OR win_rate IS NULL THEN 0.273 ELSE 0.15 END
    ) * 100.0, 1)
    FROM latest
    WHERE performance_snapshots.trader_id = latest.trader_id
      AND performance_snapshots.snapshot_date = latest.max_date
  `).bind(roiMin, roiMax, shMin, shMax, wrMin, wrMax, imddMin, imddMax).run();
}

/**
 * Assign sync tiers entirely in SQL using ROW_NUMBER() + UPDATE FROM.
 *
 * Tier 1: Top 100 by composite score
 * Tier 2: Rank 101-500
 * Tier 3: Rank 501-2000 OR trades in last 48h
 * Tier 4: Active (trades in last 7d)
 * Tier 5: Dormant (no trades 30d+ or never traded)
 *
 * Total: 1 D1 call regardless of trader count.
 */
async function assignSyncTiers(env: Env): Promise<void> {
  const result = await env.DB.prepare(`
    WITH latest_scores AS (
      SELECT ps.trader_id, ps.composite_score
      FROM performance_snapshots ps
      INNER JOIN (
        SELECT trader_id, MAX(snapshot_date) AS max_date
        FROM performance_snapshots GROUP BY trader_id
      ) l ON ps.trader_id = l.trader_id AND ps.snapshot_date = l.max_date
    ),
    ranked AS (
      SELECT t.id, t.last_trade_at,
        ROW_NUMBER() OVER (ORDER BY COALESCE(ls.composite_score, 0) DESC) AS rk
      FROM traders t
      INNER JOIN oauth_tokens ot ON ot.trader_id = t.id
      LEFT JOIN latest_scores ls ON ls.trader_id = t.id
      WHERE t.is_active = 1
    )
    UPDATE traders SET sync_tier = CASE
      WHEN ranked.rk <= 100 THEN 1
      WHEN ranked.rk <= 500 THEN 2
      WHEN ranked.rk <= 2000
        OR ranked.last_trade_at >= datetime('now', '-48 hours') THEN 3
      WHEN ranked.last_trade_at >= datetime('now', '-7 days') THEN 4
      ELSE 5
    END
    FROM ranked
    WHERE traders.id = ranked.id
  `).run();

  console.log(`[cron] Assigned tiers to ${result.meta.changes} traders`);
}

/**
 * Safety net: re-enqueue any trader that hasn't been synced in 24h.
 * Limits to 100 per cycle to avoid queue burst.
 */
async function reEnqueueStaleTraders(env: Env): Promise<void> {
  const stale = await env.DB.prepare(`
    SELECT t.id, t.sync_tier
    FROM traders t
    INNER JOIN oauth_tokens ot ON ot.trader_id = t.id
    WHERE t.is_active = 1
      AND (t.last_synced_at IS NULL OR t.last_synced_at < datetime('now', '-24 hours'))
    LIMIT 100
  `).all<StaleTraderRow>();

  if (stale.results.length === 0) return;

  for (const row of stale.results) {
    const tier = row.sync_tier as SyncTier;
    await env.SYNC_QUEUE.send(
      { traderId: row.id } satisfies SyncMessage,
      { delaySeconds: tierDelaySeconds(tier) }
    );
  }

  console.log(`[cron] Re-enqueued ${stale.results.length} stale traders`);
}

async function rebuildCaches(env: Env): Promise<void> {
  await invalidateLeaderboardCaches(env);

  // Pre-cache the default leaderboard view
  const defaultData = await queryLeaderboard(env, {
    period: "30", sort: "composite_score", assetClass: "all",
    minTrades: 0, limit: 100, offset: 0,
  });
  const defaultKey = leaderboardCacheKey("30", "composite_score", "all", 10);
  await setCachedLeaderboard(env, defaultKey, defaultData);

  // Pre-cache stats
  const stats = await queryStats(env);
  await setCachedStats(env, stats);
}
