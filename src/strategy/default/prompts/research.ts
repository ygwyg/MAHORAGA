/**
 * Research prompt builders — signal and position analysis.
 *
 * These return PromptTemplate objects. The core harness makes the LLM call.
 */

import type { Position } from "../../../core/types";
import type { PromptTemplate, ResearchPositionPromptBuilder, ResearchSignalPromptBuilder } from "../../types";

/**
 * Signal research prompt — evaluate whether to BUY a symbol based on
 * social sentiment and price data.
 */
export const researchSignalPrompt: ResearchSignalPromptBuilder = (
  symbol: string,
  sentiment: number,
  sources: string[],
  price: number
): PromptTemplate => ({
  system: "You are a stock research analyst. Be skeptical of hype. Output valid JSON only.",
  user: `Should we BUY this stock based on social sentiment and fundamentals?

SYMBOL: ${symbol}
SENTIMENT: ${(sentiment * 100).toFixed(0)}% bullish (sources: ${sources.join(", ")})

CURRENT DATA:
- Price: $${price}

Evaluate if this is a good entry. Consider: Is the sentiment justified? Is it too late (already pumped)? Any red flags?

JSON response:
{
  "verdict": "BUY|SKIP|WAIT",
  "confidence": 0.0-1.0,
  "entry_quality": "excellent|good|fair|poor",
  "reasoning": "brief reason",
  "red_flags": ["any concerns"],
  "catalysts": ["positive factors"]
}`,
  maxTokens: 250,
});

/**
 * Position research prompt — risk assessment for a held position.
 */
export const researchPositionPrompt: ResearchPositionPromptBuilder = (
  symbol: string,
  position: Position,
  plPct: number
): PromptTemplate => ({
  system: "You are a position risk analyst. Be concise. Output valid JSON only.",
  user: `Analyze this position for risk and opportunity:

POSITION: ${symbol}
- Shares: ${position.qty}
- Market Value: $${position.market_value.toFixed(2)}
- P&L: $${position.unrealized_pl.toFixed(2)} (${plPct.toFixed(1)}%)
- Current Price: $${position.current_price}

Provide a brief risk assessment and recommendation (HOLD, SELL, or ADD). JSON format:
{
  "recommendation": "HOLD|SELL|ADD",
  "risk_level": "low|medium|high",
  "reasoning": "brief reason",
  "key_factors": ["factor1", "factor2"]
}`,
  maxTokens: 200,
});
