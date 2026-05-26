/**
 * Crypto trading rules — momentum-based crypto entry/exit via Alpaca.
 *
 * These are standalone helpers used by the core harness for crypto-specific logic.
 * The main selectEntries/selectExits handle stocks; crypto has its own flow
 * because it trades 24/7 outside of market hours.
 */

import type { Position, ResearchResult } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { StrategyContext } from "../../types";

/**
 * Research a crypto symbol for BUY/SKIP/WAIT verdict.
 */
export async function researchCrypto(
  ctx: StrategyContext,
  symbol: string,
  momentum: number,
  sentiment: number
): Promise<ResearchResult | null> {
  if (!ctx.llm) {
    ctx.log("Crypto", "skipped_no_llm", { symbol, reason: "LLM Provider not configured" });
    return null;
  }

  try {
    const alpaca = createAlpacaProviders(ctx.env);
    const snapshot = await alpaca.marketData.getCryptoSnapshot(symbol).catch(() => null);
    const price = snapshot?.latest_trade?.price || 0;
    const dailyChange = snapshot
      ? ((snapshot.daily_bar.c - snapshot.prev_daily_bar.c) / snapshot.prev_daily_bar.c) * 100
      : 0;

    const prompt = `Should we BUY this cryptocurrency based on momentum and market conditions?

SYMBOL: ${symbol}
PRICE: $${price.toFixed(2)}
24H CHANGE: ${dailyChange.toFixed(2)}%
MOMENTUM SCORE: ${(momentum * 100).toFixed(0)}%
SENTIMENT: ${(sentiment * 100).toFixed(0)}% bullish

Evaluate if this is a good entry. Consider:
- Is the momentum sustainable or a trap?
- Any major news/events affecting this crypto?
- Risk/reward at current price level?

JSON response:
{
  "verdict": "BUY|SKIP|WAIT",
  "confidence": 0.0-1.0,
  "entry_quality": "excellent|good|fair|poor",
  "reasoning": "brief reason",
  "red_flags": ["any concerns"],
  "catalysts": ["positive factors"]
}`;

    const response = await ctx.llm.complete({
      model: ctx.config.llm_model,
      messages: [
        {
          role: "system",
          content:
            "You are a crypto analyst. Be skeptical of FOMO. Crypto is volatile - only recommend BUY for strong setups. Output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const usage = response.usage;
    if (usage) {
      ctx.trackLLMCost(ctx.config.llm_model, usage.prompt_tokens, usage.completion_tokens);
    }

    const content = response.content || "{}";
    const analysis = JSON.parse(content.replace(/```json\n?|```/g, "").trim()) as {
      verdict: "BUY" | "SKIP" | "WAIT";
      confidence: number;
      entry_quality: "excellent" | "good" | "fair" | "poor";
      reasoning: string;
      red_flags: string[];
      catalysts: string[];
    };

    const result: ResearchResult = {
      symbol,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      entry_quality: analysis.entry_quality,
      reasoning: analysis.reasoning,
      red_flags: analysis.red_flags || [],
      catalysts: analysis.catalysts || [],
      timestamp: Date.now(),
    };

    ctx.log("Crypto", "researched", {
      symbol,
      verdict: result.verdict,
      confidence: result.confidence,
      quality: result.entry_quality,
    });

    return result;
  } catch (error) {
    ctx.log("Crypto", "research_error", { symbol, error: String(error) });
    return null;
  }
}

/**
 * Run crypto-specific trading loop: check exits, then entries.
 * Called from the core harness when crypto_enabled is true.
 */
export async function runCryptoTrading(ctx: StrategyContext, positions: Position[]): Promise<void> {
  if (!ctx.config.crypto_enabled) return;

  const cryptoSymbols = new Set(ctx.config.crypto_symbols || []);
  const cryptoPositions = positions.filter((p) => cryptoSymbols.has(p.symbol) || p.symbol.includes("/"));
  const heldCrypto = new Set(cryptoPositions.map((p) => p.symbol));

  // Check exits
  for (const pos of cryptoPositions) {
    const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100;

    if (plPct >= ctx.config.crypto_take_profit_pct) {
      ctx.log("Crypto", "take_profit", { symbol: pos.symbol, pnl: plPct.toFixed(2) });
      await ctx.broker.sell(pos.symbol, `Crypto take profit at +${plPct.toFixed(1)}%`);
      continue;
    }

    if (plPct <= -ctx.config.crypto_stop_loss_pct) {
      ctx.log("Crypto", "stop_loss", { symbol: pos.symbol, pnl: plPct.toFixed(2) });
      await ctx.broker.sell(pos.symbol, `Crypto stop loss at ${plPct.toFixed(1)}%`);
    }
  }

  // Check entries
  const maxCryptoPositions = Math.min(ctx.config.crypto_symbols?.length || 3, 3);
  if (cryptoPositions.length >= maxCryptoPositions) return;

  const cryptoSignals = ctx.signals
    .filter((s) => s.isCrypto)
    .filter((s) => !heldCrypto.has(s.symbol))
    .filter((s) => s.sentiment > 0)
    .sort((a, b) => (b.momentum || 0) - (a.momentum || 0));

  const CRYPTO_RESEARCH_TTL_MS = 300_000;

  for (const signal of cryptoSignals.slice(0, 2)) {
    if (cryptoPositions.length >= maxCryptoPositions) break;

    const cachedResearch = ctx.state.get<ResearchResult>(`cryptoResearch_${signal.symbol}`);
    let research: ResearchResult | null = cachedResearch ?? null;

    if (!cachedResearch || Date.now() - cachedResearch.timestamp > CRYPTO_RESEARCH_TTL_MS) {
      research = await researchCrypto(ctx, signal.symbol, signal.momentum || 0, signal.sentiment);
      if (research) ctx.state.set(`cryptoResearch_${signal.symbol}`, research);
    }

    if (!research || research.verdict !== "BUY") {
      ctx.log("Crypto", "research_skip", {
        symbol: signal.symbol,
        verdict: research?.verdict || "NO_RESEARCH",
        confidence: research?.confidence || 0,
      });
      continue;
    }

    if (research.confidence < ctx.config.min_analyst_confidence) {
      ctx.log("Crypto", "low_confidence", { symbol: signal.symbol, confidence: research.confidence });
      continue;
    }

    const account = await ctx.broker.getAccount();
    const sizePct = Math.min(20, ctx.config.position_size_pct_of_cash);
    const positionSize = Math.min(
      account.cash * (sizePct / 100) * research.confidence,
      ctx.config.crypto_max_position_value
    );

    if (positionSize < 10) {
      ctx.log("Crypto", "buy_skipped", { symbol: signal.symbol, reason: "Position too small" });
      continue;
    }

    const result = await ctx.broker.buy(signal.symbol, positionSize, `Crypto momentum: ${research.reasoning}`);
    if (result) {
      heldCrypto.add(signal.symbol);
      cryptoPositions.push({ symbol: signal.symbol } as Position);
      break;
    }
  }
}
