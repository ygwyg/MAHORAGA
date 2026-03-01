/**
 * Monte Carlo simulation types.
 *
 * These types define the interface between the MC probability engine
 * and the rest of MAHORAGA (strategy rules, risk engine, monitoring).
 */

/** Parameters for a single MC simulation run. */
export interface MCSimulationParams {
  /** Current asset price */
  currentPrice: number;
  /** Annualized volatility estimate (e.g., from ATR or Bollinger width) */
  impliedVol: number;
  /** Simulation time horizon in milliseconds */
  horizonMs: number;
  /** Target price for binary outcome (profit if price >= target) */
  targetPrice?: number;
  /** Number of simulation paths (default: 10_000) */
  numPaths?: number;
}

/** Result of a Monte Carlo simulation. */
export interface MCSimulationResult {
  /** Estimated probability of profitable outcome [0, 1] */
  probability: number;
  /** 95% confidence interval for the probability estimate */
  confidenceInterval: [lower: number, upper: number];
  /** Number of paths actually simulated */
  pathsSimulated: number;
  /** Simulation wall-clock time in ms */
  computeTimeMs: number;
}
