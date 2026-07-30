import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../env.d";
import type { StrategyContext } from "../../types";
import { DEFAULT_CONFIG } from "../config";
import { adanosGatherer } from "./adanos";

function createContext(options: { apiKey?: string; cryptoEnabled?: boolean } = {}) {
  const state = new Map<string, unknown>();
  const log = vi.fn();
  const ctx = {
    env: { ADANOS_API_KEY: options.apiKey } as Env,
    config: {
      ...DEFAULT_CONFIG,
      crypto_enabled: options.cryptoEnabled ?? false,
      crypto_symbols: ["BTC/USD"],
      ticker_blacklist: ["BLOCKED"],
    },
    log,
    sleep: vi.fn().mockResolvedValue(undefined),
    state: {
      get<T>(key: string): T | undefined {
        return state.get(key) as T | undefined;
      },
      set<T>(key: string, value: T): void {
        state.set(key, value);
      },
    },
  } as unknown as StrategyContext;

  return { ctx, log, state };
}

function trendingResponse(items: unknown[]): Response {
  return new Response(JSON.stringify(items), { status: 200 });
}

describe("adanosGatherer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is disabled when no API key is configured", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { ctx } = createContext();

    await expect(adanosGatherer.gather(ctx)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps stock and configured crypto sentiment and reuses the persistent cache", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-30T12:00:00Z"));
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        trendingResponse([
          {
            ticker: "NVDA",
            company_name: "NVIDIA Corporation",
            buzz_score: 82.4,
            trend: "rising",
            mentions: 200,
            sentiment_score: 0.4,
            bullish_pct: 55,
            bearish_pct: 20,
          },
          {
            ticker: "BLOCKED",
            company_name: "Blocked Inc.",
            buzz_score: 50,
            trend: "stable",
            mentions: 20,
            sentiment_score: 0.1,
            bullish_pct: 30,
            bearish_pct: 20,
          },
        ])
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                symbol: "BTC",
                name: "Bitcoin",
                buzz_score: 75,
                trend: "stable",
                mentions: 150,
                sentiment_score: -0.2,
                bullish_pct: 25,
                bearish_pct: 40,
              },
            ],
          }),
          { status: 200 }
        )
      );
    const { ctx } = createContext({ apiKey: "placeholder", cryptoEnabled: true });

    const first = await adanosGatherer.gather(ctx);
    const second = await adanosGatherer.gather(ctx);

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      symbol: "NVDA",
      source: "adanos",
      source_detail: "adanos_reddit_stocks",
      raw_sentiment: 0.4,
      volume: 200,
      isCrypto: false,
    });
    expect(first[0]?.sentiment).toBeCloseTo(0.36);
    expect(first[1]).toMatchObject({
      symbol: "BTC/USD",
      source_detail: "adanos_reddit_crypto",
      isCrypto: true,
    });
    expect(first[1]?.sentiment).toBeCloseTo(-0.18);
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [requestUrl] of fetcher.mock.calls) {
      const url = requestUrl as URL;
      expect(url.searchParams.get("from")).toBe("2026-07-24");
      expect(url.searchParams.get("to")).toBe("2026-07-30");
      expect(url.searchParams.has("days")).toBe(false);
    }
    expect((fetcher.mock.calls[1]?.[0] as URL).searchParams.get("symbols")).toBe("BTC");
  });

  it("fails open with cached signals when a refresh fails", async () => {
    const now = Date.parse("2026-07-30T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"));
    const { ctx, log, state } = createContext({ apiKey: "placeholder" });
    const cachedAt = now - 9 * 60 * 60 * 1000;
    state.set("adanosCache", {
      stocks: {
        fetchedAt: cachedAt,
        assets: [
          {
            symbol: "AAPL",
            name: "Apple Inc.",
            buzz_score: 60,
            trend: "stable",
            mentions: 50,
            sentiment_score: 0.22,
            bullish_pct: 40,
            bearish_pct: 18,
          },
        ],
      },
    });

    await expect(adanosGatherer.gather(ctx)).resolves.toEqual([
      expect.objectContaining({ symbol: "AAPL", timestamp: cachedAt }),
    ]);
    expect(log).toHaveBeenCalledWith("Adanos", "fetch_error", {
      endpoint: "stocks",
      message: "Error: network unavailable",
    });
    const cache = state.get("adanosCache") as { stocks: { fetchedAt: number } } | undefined;
    expect(cache?.stocks.fetchedAt).toBe(cachedAt);
  });

  it("retains only the failed source from cache after a partial refresh", async () => {
    const now = Date.parse("2026-07-30T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        trendingResponse([
          {
            ticker: "MSFT",
            company_name: "Microsoft Corporation",
            buzz_score: 60,
            trend: "stable",
            mentions: 80,
            sentiment_score: 0.25,
            bullish_pct: 45,
            bearish_pct: 20,
          },
        ])
      )
      .mockRejectedValueOnce(new Error("crypto unavailable"));
    const { ctx, state } = createContext({ apiKey: "placeholder", cryptoEnabled: true });
    const cachedAt = now - 9 * 60 * 60 * 1000;
    state.set("adanosCache", {
      stocks: {
        fetchedAt: cachedAt,
        assets: [
          {
            symbol: "AAPL",
            name: "Apple Inc.",
            buzz_score: 50,
            trend: "stable",
            mentions: 20,
            sentiment_score: 0.1,
            bullish_pct: 35,
            bearish_pct: 25,
          },
        ],
      },
      crypto: {
        fetchedAt: cachedAt,
        assets: [
          {
            symbol: "BTC",
            name: "Bitcoin",
            buzz_score: 70,
            trend: "stable",
            mentions: 100,
            sentiment_score: 0.2,
            bullish_pct: 45,
            bearish_pct: 20,
          },
        ],
      },
    });

    const signals = await adanosGatherer.gather(ctx);

    expect(signals.map((signal) => signal.symbol)).toEqual(["MSFT", "BTC/USD"]);
    const cache = state.get("adanosCache") as
      | { stocks: { fetchedAt: number }; crypto: { fetchedAt: number } }
      | undefined;
    expect(cache?.stocks.fetchedAt).toBe(now);
    expect(cache?.crypto.fetchedAt).toBe(cachedAt);
  });

  it("reapplies current strategy filters to a fresh cache entry", async () => {
    const now = Date.parse("2026-07-30T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { ctx, state } = createContext({ apiKey: "placeholder", cryptoEnabled: false });
    state.set("adanosCache", {
      stocks: {
        fetchedAt: now - 60_000,
        assets: [
          {
            symbol: "BLOCKED",
            name: "Blocked Inc.",
            buzz_score: 50,
            trend: "stable",
            mentions: 20,
            sentiment_score: 0.1,
            bullish_pct: 35,
            bearish_pct: 25,
          },
        ],
      },
      crypto: {
        fetchedAt: now - 60_000,
        assets: [
          {
            symbol: "BTC",
            name: "Bitcoin",
            buzz_score: 70,
            trend: "stable",
            mentions: 100,
            sentiment_score: 0.2,
            bullish_pct: 45,
            bearish_pct: 20,
          },
        ],
      },
    });

    await expect(adanosGatherer.gather(ctx)).resolves.toEqual([]);
    ctx.config.ticker_blacklist = [];
    await expect(adanosGatherer.gather(ctx)).resolves.toEqual([expect.objectContaining({ symbol: "BLOCKED" })]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
