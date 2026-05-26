/**
 * Staleness detection — identifies positions that have lost momentum.
 *
 * Scored 0-100 based on:
 * - Time held (vs max hold days)
 * - Price action (P&L vs targets)
 * - Social volume decay (vs entry volume)
 */

import type { AgentConfig, PositionEntry } from "../../../core/types";

export interface StalenessResult {
  isStale: boolean;
  reason: string;
  staleness_score: number;
}

export function analyzeStaleness(
  _symbol: string,
  currentPrice: number,
  currentSocialVolume: number,
  entry: PositionEntry | undefined,
  config: AgentConfig
): StalenessResult {
  if (!entry) {
    return { isStale: false, reason: "No entry data", staleness_score: 0 };
  }

  const holdHours = (Date.now() - entry.entry_time) / (1000 * 60 * 60);
  const holdDays = holdHours / 24;
  const pnlPct = entry.entry_price > 0 ? ((currentPrice - entry.entry_price) / entry.entry_price) * 100 : 0;

  if (holdHours < config.stale_min_hold_hours) {
    return { isStale: false, reason: `Too early (${holdHours.toFixed(1)}h)`, staleness_score: 0 };
  }

  let stalenessScore = 0;

  // Time-based (max 40 points)
  if (holdDays >= config.stale_max_hold_days) {
    stalenessScore += 40;
  } else if (holdDays >= config.stale_mid_hold_days) {
    stalenessScore +=
      (20 * (holdDays - config.stale_mid_hold_days)) / (config.stale_max_hold_days - config.stale_mid_hold_days);
  }

  // Price action (max 30 points)
  if (pnlPct < 0) {
    stalenessScore += Math.min(30, Math.abs(pnlPct) * 3);
  } else if (pnlPct < config.stale_mid_min_gain_pct && holdDays >= config.stale_mid_hold_days) {
    stalenessScore += 15;
  }

  // Social volume decay (max 30 points)
  const volumeRatio = entry.entry_social_volume > 0 ? currentSocialVolume / entry.entry_social_volume : 1;
  if (volumeRatio <= config.stale_social_volume_decay) {
    stalenessScore += 30;
  } else if (volumeRatio <= 0.5) {
    stalenessScore += 15;
  }

  stalenessScore = Math.min(100, stalenessScore);

  const isStale =
    stalenessScore >= 70 || (holdDays >= config.stale_max_hold_days && pnlPct < config.stale_min_gain_pct);

  return {
    isStale,
    reason: isStale
      ? `Staleness score ${stalenessScore}/100, held ${holdDays.toFixed(1)} days`
      : `OK (score ${stalenessScore}/100)`,
    staleness_score: stalenessScore,
  };
}
