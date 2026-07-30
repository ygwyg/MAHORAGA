/**
 * Adanos gatherer — optional stock and crypto sentiment from the Adanos API.
 */

import type { Signal } from "../../../core/types";
import { type AdanosTrendingAsset, createAdanosSentimentProvider } from "../../../providers/social/adanos";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";

const POLL_INTERVAL_MS = 8 * 60 * 60 * 1000;
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

interface CachedAssets {
  fetchedAt: number;
  assets: AdanosTrendingAsset[];
  symbols?: string[];
}

interface AdanosCache {
  stocks?: CachedAssets;
  crypto?: CachedAssets;
}

function utcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function isUsableAsset(asset: AdanosTrendingAsset): boolean {
  return asset.mentions > 0;
}

function isFresh(entry: CachedAssets | undefined, now: number): entry is CachedAssets {
  return Boolean(entry && now - entry.fetchedAt < POLL_INTERVAL_MS);
}

function hasFreshCrypto(entry: CachedAssets | undefined, now: number, symbols: Set<string>): entry is CachedAssets {
  if (!isFresh(entry, now) || !entry.symbols) return false;
  const cachedSymbols = new Set(entry.symbols);
  return [...symbols].every((symbol) => cachedSymbols.has(symbol));
}

function toSignal(asset: AdanosTrendingAsset, now: number, fetchedAt: number, isCrypto: boolean): Signal {
  const baseSymbol = asset.symbol.toUpperCase().replace(/\/USD$/, "");
  const symbol = isCrypto ? `${baseSymbol}/USD` : baseSymbol;
  const sourceWeight = SOURCE_CONFIG.weights.adanos;
  const freshness = Math.max(0, 1 - (now - fetchedAt) / STALE_MAX_AGE_MS);

  return {
    symbol,
    source: "adanos",
    source_detail: isCrypto ? "adanos_reddit_crypto" : "adanos_reddit_stocks",
    sentiment: asset.sentiment_score * sourceWeight * freshness,
    raw_sentiment: asset.sentiment_score,
    volume: asset.mentions,
    freshness,
    source_weight: sourceWeight,
    reason: `Adanos Reddit: ${asset.mentions} mentions, ${asset.bullish_pct}% bullish/${asset.bearish_pct}% bearish, buzz ${asset.buzz_score.toFixed(1)}, activity ${asset.trend}`,
    isCrypto,
    timestamp: fetchedAt,
  };
}

async function gatherAdanos(ctx: StrategyContext): Promise<Signal[]> {
  const apiKey = ctx.env.ADANOS_API_KEY?.trim();
  if (!apiKey) return [];

  const now = Date.now();
  const stockBlacklist = new Set(ctx.config.ticker_blacklist.map((symbol) => symbol.toUpperCase()));
  const cryptoSymbols = new Set(ctx.config.crypto_symbols.map((symbol) => symbol.toUpperCase().replace(/\/USD$/, "")));
  const cached = ctx.state.get<AdanosCache>("adanosCache") ?? {};

  const provider = createAdanosSentimentProvider(apiKey);
  const to = utcDate(now);
  const from = utcDate(now - (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);
  const requests: Array<{
    kind: "stocks" | "crypto";
    promise: Promise<AdanosTrendingAsset[]>;
    symbols?: string[];
  }> = [];

  if (!isFresh(cached.stocks, now)) {
    requests.push({ kind: "stocks", promise: provider.getTrendingStocks(from, to) });
  }

  if (ctx.config.crypto_enabled && cryptoSymbols.size > 0 && !hasFreshCrypto(cached.crypto, now, cryptoSymbols)) {
    const symbols = [...cryptoSymbols];
    requests.push({ kind: "crypto", promise: provider.getCryptoSentiment(symbols, from, to), symbols });
  }

  const results = await Promise.allSettled(requests.map(({ promise }) => promise));
  const nextCache: AdanosCache = { ...cached };

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const kind = requests[index]?.kind;
    if (!result || !kind) continue;

    if (result.status === "rejected") {
      ctx.log("Adanos", "fetch_error", { endpoint: kind, message: String(result.reason) });
      continue;
    }

    nextCache[kind] = { fetchedAt: now, assets: result.value, symbols: requests[index]?.symbols };
  }

  ctx.state.set<AdanosCache>("adanosCache", nextCache);

  const signals: Signal[] = [];
  const sources: Array<{ entry: CachedAssets | undefined; isCrypto: boolean }> = [
    { entry: nextCache.stocks, isCrypto: false },
  ];
  if (ctx.config.crypto_enabled) {
    sources.push({ entry: nextCache.crypto, isCrypto: true });
  }

  for (const { entry, isCrypto } of sources) {
    if (!entry || now - entry.fetchedAt > STALE_MAX_AGE_MS) continue;
    for (const asset of entry.assets) {
      if (!isUsableAsset(asset)) continue;
      const baseSymbol = asset.symbol.toUpperCase().replace(/\/USD$/, "");
      if (isCrypto && !cryptoSymbols.has(baseSymbol)) continue;
      // Broker asset and exchange checks remain centralized in PolicyBroker immediately before orders.
      if (!isCrypto && stockBlacklist.has(baseSymbol)) continue;
      signals.push(toSignal(asset, now, entry.fetchedAt, isCrypto));
    }
  }

  ctx.log("Adanos", "gathered_signals", { count: signals.length });
  return signals;
}

export const adanosGatherer: Gatherer = {
  name: "adanos",
  gather: gatherAdanos,
};
