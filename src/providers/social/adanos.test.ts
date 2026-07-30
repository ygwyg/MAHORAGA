import { afterEach, describe, expect, it, vi } from "vitest";
import { AdanosSentimentProvider } from "./adanos";

describe("AdanosSentimentProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests stock sentiment with explicit UTC dates and API key auth", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
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
        ]),
        { status: 200 }
      )
    );
    const provider = new AdanosSentimentProvider("placeholder", fetcher as typeof fetch);

    const assets = await provider.getTrendingStocks("2026-07-24", "2026-07-30", 10);

    expect(assets).toEqual([
      {
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        buzz_score: 82.4,
        trend: "rising",
        mentions: 200,
        sentiment_score: 0.4,
        bullish_pct: 55,
        bearish_pct: 20,
      },
    ]);
    const [requestUrl, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe("/reddit/stocks/v1/trending");
    expect(requestUrl.searchParams.get("from")).toBe("2026-07-24");
    expect(requestUrl.searchParams.get("to")).toBe("2026-07-30");
    expect(requestUrl.searchParams.get("days")).toBeNull();
    expect(requestUrl.searchParams.get("limit")).toBe("10");
    expect(requestUrl.searchParams.get("type")).toBe("stock");
    expect(init.headers).toEqual({ "X-API-Key": "placeholder" });
  });

  it("rejects HTTP errors without exposing response content", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret upstream detail", { status: 401 }));
    const provider = new AdanosSentimentProvider("placeholder", fetcher as typeof fetch);

    await expect(provider.getCryptoSentiment(["BTC"], "2026-07-24", "2026-07-30")).rejects.toThrow(
      "Adanos API returned HTTP 401"
    );
  });

  it("rejects non-array trending responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "unexpected" }), { status: 200 }));
    const provider = new AdanosSentimentProvider("placeholder", fetcher as typeof fetch);

    await expect(provider.getTrendingStocks("2026-07-24", "2026-07-30")).rejects.toThrow(
      "Adanos API returned an invalid trending response"
    );
  });

  it("drops malformed items without rejecting the complete response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tokens: [
            null,
            { symbol: "ETH", mentions: 10, sentiment_score: 0.2 },
            {
              symbol: "DOGE",
              name: "Dogecoin",
              buzz_score: 70,
              trend: "rising",
              mentions: 100,
              sentiment_score: 10,
              bullish_pct: 50,
              bearish_pct: 20,
            },
            {
              symbol: "BTC",
              name: "Bitcoin",
              buzz_score: 70,
              trend: "rising",
              mentions: 100,
              sentiment_score: 0.3,
              bullish_pct: 50,
              bearish_pct: 20,
            },
          ],
        }),
        { status: 200 }
      )
    );
    const provider = new AdanosSentimentProvider("placeholder", fetcher as typeof fetch);

    await expect(provider.getCryptoSentiment(["BTC", "ETH", "DOGE"], "2026-07-24", "2026-07-30")).resolves.toEqual([
      expect.objectContaining({ symbol: "BTC", buzz_score: 70 }),
    ]);
    const [requestUrl] = fetcher.mock.calls[0] as [URL];
    expect(requestUrl.pathname).toBe("/reddit/crypto/v1/compare");
    expect(requestUrl.searchParams.get("symbols")).toBe("BTC,ETH,DOGE");
    expect(requestUrl.searchParams.has("days")).toBe(false);
  });

  it("chunks configured crypto symbols at the compare endpoint limit", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ tokens: [] }), { status: 200 }));
    const provider = new AdanosSentimentProvider("placeholder", fetcher as typeof fetch);
    const symbols = Array.from({ length: 12 }, (_, index) => `C${index}`);

    await provider.getCryptoSentiment(symbols, "2026-07-24", "2026-07-30");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("symbols")).toBe(symbols.slice(0, 10).join(","));
    expect((fetcher.mock.calls[1]?.[0] as URL).searchParams.get("symbols")).toBe(symbols.slice(10).join(","));
  });
});
