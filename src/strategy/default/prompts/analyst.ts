/**
 * Analyst prompt builder — batch signal analysis for trading decisions.
 */

import type { Account, Position, Signal } from "../../../core/types";
import type { AnalyzeSignalsPromptBuilder, PromptTemplate, StrategyContext } from "../../types";

/**
 * Analyst prompt — analyze signals and current positions to generate
 * BUY/SELL/HOLD recommendations.
 */
export const analyzeSignalsPrompt: AnalyzeSignalsPromptBuilder = (
  signals: Signal[],
  positions: Position[],
  account: Account,
  ctx: StrategyContext
): PromptTemplate => {
  const aggregated = new Map<string, { symbol: string; sources: string[]; totalSentiment: number; count: number }>();
  for (const sig of signals) {
    if (!aggregated.has(sig.symbol)) {
      aggregated.set(sig.symbol, { symbol: sig.symbol, sources: [], totalSentiment: 0, count: 0 });
    }
    const agg = aggregated.get(sig.symbol)!;
    agg.sources.push(sig.source);
    agg.totalSentiment += sig.sentiment;
    agg.count++;
  }

  const candidates = Array.from(aggregated.values())
    .map((a) => ({ ...a, avgSentiment: a.totalSentiment / a.count }))
    .filter((a) => a.avgSentiment >= ctx.config.min_sentiment_score * 0.5)
    .sort((a, b) => b.avgSentiment - a.avgSentiment)
    .slice(0, 10);

  const positionSymbols = new Set(positions.map((p) => p.symbol));

  const user = `Current Time: ${new Date().toISOString()}

ACCOUNT STATUS:
- Equity: $${account.equity.toFixed(2)}
- Cash: $${account.cash.toFixed(2)}
- Current Positions: ${positions.length}/${ctx.config.max_positions}

CURRENT POSITIONS:
${
  positions.length === 0
    ? "None"
    : positions
        .map((p) => {
          const entry = ctx.positionEntries[p.symbol];
          const holdMinutes = entry ? Math.round((Date.now() - entry.entry_time) / (1000 * 60)) : 0;
          const holdStr = holdMinutes >= 60 ? `${(holdMinutes / 60).toFixed(1)}h` : `${holdMinutes}m`;
          return `- ${p.symbol}: ${p.qty} shares, P&L: $${p.unrealized_pl.toFixed(2)} (${((p.unrealized_pl / (p.market_value - p.unrealized_pl)) * 100).toFixed(1)}%), held ${holdStr}`;
        })
        .join("\n")
}

TOP SENTIMENT CANDIDATES:
${candidates
  .map(
    (c) =>
      `- ${c.symbol}: avg sentiment ${(c.avgSentiment * 100).toFixed(0)}%, sources: ${c.sources.join(", ")}, ${positionSymbols.has(c.symbol) ? "[CURRENTLY HELD]" : "[NOT HELD]"}`
  )
  .join("\n")}

RAW SIGNALS (top 20):
${signals
  .slice(0, 20)
  .map((s) => `- ${s.symbol} (${s.source}): ${s.reason}`)
  .join("\n")}

TRADING RULES:
- Max position size: $${ctx.config.max_position_value}
- Take profit target: ${ctx.config.take_profit_pct}%
- Stop loss: ${ctx.config.stop_loss_pct}%
- Min confidence to trade: ${ctx.config.min_analyst_confidence}
- Min hold time before selling: ${ctx.config.llm_min_hold_minutes ?? 30} minutes

Analyze and provide BUY/SELL/HOLD recommendations:`;

  return {
    system: `You are a senior trading analyst AI. Make the FINAL trading decisions based on social sentiment signals.

Rules:
- Only recommend BUY for symbols with strong conviction from multiple data points
- Recommend SELL only for positions that have been held long enough AND show deteriorating sentiment or major red flags
- Give positions time to develop - avoid selling too early just because gains are small
- Positions held less than 1-2 hours should generally be given more time unless hitting stop loss
- Consider the QUALITY of sentiment, not just quantity
- Output valid JSON only

Response format:
{
  "recommendations": [
    { "action": "BUY"|"SELL"|"HOLD", "symbol": "TICKER", "confidence": 0.0-1.0, "reasoning": "detailed reasoning", "suggested_size_pct": 10-30 }
  ],
  "market_summary": "overall market read and sentiment",
  "high_conviction_plays": ["symbols you feel strongest about"]
}`,
    user,
    model: ctx.config.llm_analyst_model,
    maxTokens: 800,
  };
};
