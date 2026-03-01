/**
 * Entry rules — decide which signals to buy.
 *
 * Core handles PolicyEngine checks and actual order execution.
 * Core ALWAYS enforces stop-loss from config as a safety floor.
 *
 * MC-enhanced (Phase 1): Entry requires BOTH:
 *   1. LLM verdict = BUY
 *   2. MC probability > min_analyst_confidence threshold
 *
 * Final ranking uses ensemble score:
 *   final_score = 0.4 * mc_prob + 0.4 * llm_confidence + 0.2 * sentiment_score
 */

import type { Account, Position, ResearchResult } from "../../../core/types";
import type { BuyCandidate, StrategyContext } from "../../types";
import { runSimulation } from "../../../mc/simulator";

/** Ensemble weight constants */
const W_MC = 0.4;
const W_LLM = 0.4;
const W_SENTIMENT = 0.2;

/**
 * Compute ensemble score combining MC probability, LLM confidence, and sentiment.
 */
function ensembleScore(mcProb: number, llmConfidence: number, sentimentScore: number): number {
  return W_MC * mcProb + W_LLM * llmConfidence + W_SENTIMENT * sentimentScore;
}

/**
 * Look up the aggregated sentiment score for a symbol from the current cycle's signals.
 * Returns a normalized [0, 1] value. Falls back to 0.5 (neutral) if no signals found.
 */
function getSymbolSentiment(ctx: StrategyContext, symbol: string): number {
  const symbolSignals = ctx.signals.filter((s) => s.symbol === symbol);
  if (symbolSignals.length === 0) return 0.5;

  // Weighted average of sentiment by source_weight
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of symbolSignals) {
    weightedSum += s.sentiment * s.source_weight;
    totalWeight += s.source_weight;
  }

  const raw = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  // Clamp to [0, 1] — signals use [-1, 1] range, normalize
  return Math.max(0, Math.min(1, (raw + 1) / 2));
}

/**
 * Select entry candidates from LLM-researched signals.
 *
 * Filters for BUY verdicts, runs MC simulation for each candidate,
 * requires MC prob above threshold, and ranks by ensemble score.
 */
export function selectEntries(
  ctx: StrategyContext,
  research: ResearchResult[],
  positions: Position[],
  account: Account
): BuyCandidate[] {
  const heldSymbols = new Set(positions.map((p) => p.symbol));
  const candidates: BuyCandidate[] = [];

  if (positions.length >= ctx.config.max_positions) return [];

  // Filter to BUY verdicts above minimum LLM confidence, not already held
  const buyResearch = research
    .filter((r) => r.verdict === "BUY" && r.confidence >= ctx.config.min_analyst_confidence)
    .filter((r) => !heldSymbols.has(r.symbol));

  // Score each candidate with MC + ensemble
  const scored = buyResearch.map((r) => {
    // Run MC simulation (stub: falls back to LLM confidence)
    const mcResult = runSimulation(
      {
        currentPrice: 0, // Price not available in ResearchResult; real impl will fetch from market data
        impliedVol: 0.3, // Default vol estimate; real impl derives from ATR/Bollinger
        horizonMs: 24 * 60 * 60 * 1000, // 1-day horizon
      },
      r.confidence // Fallback: use LLM confidence as MC probability in stub mode
    );

    const sentiment = getSymbolSentiment(ctx, r.symbol);
    const score = ensembleScore(mcResult.probability, r.confidence, sentiment);

    return { research: r, mcProb: mcResult.probability, sentiment, score };
  });

  // Require MC probability above threshold (same as min_analyst_confidence)
  const qualified = scored
    .filter((s) => s.mcProb >= ctx.config.min_analyst_confidence)
    .sort((a, b) => b.score - a.score);

  for (const { research: r, score } of qualified.slice(0, 3)) {
    if (positions.length + candidates.length >= ctx.config.max_positions) break;

    const sizePct = Math.min(20, ctx.config.position_size_pct_of_cash);
    // Use ensemble score instead of raw confidence for notional sizing
    const notional = Math.min(account.cash * (sizePct / 100) * score, ctx.config.max_position_value);

    if (notional < 100) continue;

    const shouldUseOptions =
      ctx.config.options_enabled &&
      r.confidence >= ctx.config.options_min_confidence &&
      r.entry_quality === "excellent";

    candidates.push({
      symbol: r.symbol,
      confidence: score, // Ensemble score replaces raw LLM confidence
      reason: r.reasoning,
      notional,
      useOptions: shouldUseOptions,
    });
  }

  return candidates;
}
