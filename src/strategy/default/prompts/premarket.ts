/**
 * Pre-market analysis prompt builder.
 *
 * Reuses the analyst prompt since the pre-market analysis uses
 * the same format — it's just run before market open.
 */

export { analyzeSignalsPrompt as premarketPrompt } from "./analyst";
