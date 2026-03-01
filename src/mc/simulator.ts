/**
 * Monte Carlo GBM path simulator.
 *
 * Phase 1 stub — returns LLM confidence as fallback probability.
 * Will be replaced by Jarvis's full GBM implementation with variance reduction.
 *
 * Interface is stable; only the internals will change.
 */

import type { MCSimulationParams, MCSimulationResult } from "./types";

/**
 * Run a Monte Carlo simulation to estimate the probability of a profitable outcome.
 *
 * STUB: Returns a fallback result derived from the provided fallbackConfidence.
 * When the real GBM simulator is ready, this function signature stays the same.
 */
export function runSimulation(
  params: MCSimulationParams,
  fallbackConfidence?: number
): MCSimulationResult {
  const prob = fallbackConfidence ?? 0.5;
  // Synthetic confidence interval based on assumed sample size
  const halfWidth = 1.96 * Math.sqrt((prob * (1 - prob)) / (params.numPaths ?? 10_000));

  return {
    probability: prob,
    confidenceInterval: [
      Math.max(0, prob - halfWidth),
      Math.min(1, prob + halfWidth),
    ],
    pathsSimulated: 0, // 0 signals stub mode
    computeTimeMs: 0,
  };
}
