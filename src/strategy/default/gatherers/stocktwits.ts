/**
 * StockTwits gatherer — trending symbols + sentiment from the StockTwits API.
 */

import type { Signal } from "../../../core/types";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import { calculateTimeDecay } from "../helpers/sentiment";

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  log: StrategyContext["log"],
  sleep: StrategyContext["sleep"],
  maxRetries = 3
): Promise<Response | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res;
      if (res.status === 403) {
        await sleep(1000 * 2 ** i);
        continue;
      }
      return null;
    } catch (error) {
      log("StockTwits", "fetch_retry", { url, attempt: i + 1, error: String(error) });
      await sleep(1000 * 2 ** i);
    }
  }
  return null;
}

async function gatherStockTwits(ctx: StrategyContext): Promise<Signal[]> {
  const signals: Signal[] = [];
  const sourceWeight = SOURCE_CONFIG.weights.stocktwits;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    const trendingRes = await fetchWithRetry(
      "https://api.stocktwits.com/api/2/trending/symbols.json",
      headers,
      ctx.log,
      ctx.sleep
    );
    if (!trendingRes) {
      ctx.log("StockTwits", "cloudflare_blocked", {
        message: "StockTwits API blocked by Cloudflare - using Reddit only",
      });
      return [];
    }
    const trendingData = (await trendingRes.json()) as { symbols?: Array<{ symbol: string }> };
    const trending = trendingData.symbols || [];

    for (const sym of trending.slice(0, 15)) {
      try {
        const streamRes = await fetchWithRetry(
          `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(sym.symbol)}.json?limit=30`,
          headers,
          ctx.log,
          ctx.sleep
        );
        if (!streamRes) continue;
        const streamData = (await streamRes.json()) as {
          messages?: Array<{ entities?: { sentiment?: { basic?: string } }; created_at?: string }>;
        };
        const messages = streamData.messages || [];

        let bullish = 0;
        let bearish = 0;
        let totalTimeDecay = 0;
        for (const msg of messages) {
          const sentiment = msg.entities?.sentiment?.basic;
          const msgTime = new Date(msg.created_at || Date.now()).getTime() / 1000;
          const timeDecay = calculateTimeDecay(msgTime);
          totalTimeDecay += timeDecay;

          if (sentiment === "Bullish") bullish += timeDecay;
          else if (sentiment === "Bearish") bearish += timeDecay;
        }

        const total = messages.length;
        const effectiveTotal = totalTimeDecay || 1;
        const score = effectiveTotal > 0 ? (bullish - bearish) / effectiveTotal : 0;
        const avgFreshness = total > 0 ? totalTimeDecay / total : 0;

        if (total >= 5) {
          const weightedSentiment = score * sourceWeight * avgFreshness;

          signals.push({
            symbol: sym.symbol,
            source: "stocktwits",
            source_detail: "stocktwits_trending",
            sentiment: weightedSentiment,
            raw_sentiment: score,
            volume: total,
            bullish: Math.round(bullish),
            bearish: Math.round(bearish),
            freshness: avgFreshness,
            source_weight: sourceWeight,
            reason: `StockTwits: ${Math.round(bullish)}B/${Math.round(bearish)}b (${(score * 100).toFixed(0)}%) [fresh:${(avgFreshness * 100).toFixed(0)}%]`,
            timestamp: Date.now(),
          });
        }

        await ctx.sleep(200);
      } catch (error) {
        ctx.log("StockTwits", "symbol_error", { symbol: sym.symbol, error: String(error) });
      }
    }
  } catch (error) {
    ctx.log("StockTwits", "error", { message: String(error) });
  }

  return signals;
}

export const stocktwitsGatherer: Gatherer = {
  name: "stocktwits",
  gather: gatherStockTwits,
};
