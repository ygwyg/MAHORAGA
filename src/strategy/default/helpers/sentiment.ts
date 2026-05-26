/**
 * Sentiment analysis helpers for the default strategy.
 *
 * Pure functions — no side effects, no state.
 */

import { SOURCE_CONFIG } from "../config";

/**
 * Exponential time decay for posts/signals.
 * Uses half-life from SOURCE_CONFIG.decayHalfLifeMinutes.
 * Returns value clamped to [0.2, 1.0].
 */
export function calculateTimeDecay(postTimestamp: number): number {
  const ageMinutes = (Date.now() - postTimestamp * 1000) / 60000;
  const halfLife = SOURCE_CONFIG.decayHalfLifeMinutes;
  const decay = 0.5 ** (ageMinutes / halfLife);
  return Math.max(0.2, Math.min(1.0, decay));
}

/**
 * Engagement-based multiplier using upvote and comment thresholds.
 * Returns average of upvote and comment multipliers.
 */
export function getEngagementMultiplier(upvotes: number, comments: number): number {
  let upvoteMultiplier = 0.8;
  const upvoteThresholds = Object.entries(SOURCE_CONFIG.engagement.upvotes).sort(([a], [b]) => Number(b) - Number(a));
  for (const [threshold, mult] of upvoteThresholds) {
    if (upvotes >= parseInt(threshold, 10)) {
      upvoteMultiplier = mult;
      break;
    }
  }

  let commentMultiplier = 0.9;
  const commentThresholds = Object.entries(SOURCE_CONFIG.engagement.comments).sort(([a], [b]) => Number(b) - Number(a));
  for (const [threshold, mult] of commentThresholds) {
    if (comments >= parseInt(threshold, 10)) {
      commentMultiplier = mult;
      break;
    }
  }

  return (upvoteMultiplier + commentMultiplier) / 2;
}

/** Flair-based multiplier for Reddit posts. */
export function getFlairMultiplier(flair: string | null | undefined): number {
  if (!flair) return 1.0;
  return SOURCE_CONFIG.flairMultipliers[flair.trim()] || 1.0;
}

/**
 * Keyword-based bullish/bearish sentiment scoring.
 * Returns value in [-1, +1] where positive = bullish.
 */
export function detectSentiment(text: string): number {
  const lower = text.toLowerCase();
  const bullish = [
    "moon",
    "rocket",
    "buy",
    "calls",
    "long",
    "bullish",
    "yolo",
    "tendies",
    "gains",
    "diamond",
    "squeeze",
    "pump",
    "green",
    "up",
    "breakout",
    "undervalued",
    "accumulate",
  ];
  const bearish = [
    "puts",
    "short",
    "sell",
    "bearish",
    "crash",
    "dump",
    "drill",
    "tank",
    "rip",
    "red",
    "down",
    "bag",
    "overvalued",
    "bubble",
    "avoid",
  ];

  let bull = 0;
  let bear = 0;
  for (const w of bullish) if (lower.includes(w)) bull++;
  for (const w of bearish) if (lower.includes(w)) bear++;

  const total = bull + bear;
  if (total === 0) return 0;
  return (bull - bear) / total;
}
