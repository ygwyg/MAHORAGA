const ADANOS_BASE_URL = "https://api.adanos.org";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_COMPARE_SYMBOLS = 10;

export interface AdanosTrendingAsset {
  symbol: string;
  name: string | null;
  buzz_score: number;
  trend: "rising" | "falling" | "stable";
  mentions: number;
  sentiment_score: number;
  bullish_pct: number;
  bearish_pct: number;
}

type Fetcher = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTrendingAsset(
  value: unknown,
  symbolField: "symbol" | "ticker",
  nameField: "name" | "company_name"
): AdanosTrendingAsset | null {
  if (!isRecord(value)) return null;

  const symbol = value[symbolField];
  const trend = value.trend;
  const buzzScore = value.buzz_score;
  const mentions = value.mentions;
  const sentimentScore = value.sentiment_score;
  const bullishPct = value.bullish_pct;
  const bearishPct = value.bearish_pct;
  if (
    typeof symbol !== "string" ||
    symbol.length === 0 ||
    (trend !== "rising" && trend !== "falling" && trend !== "stable") ||
    typeof buzzScore !== "number" ||
    !Number.isFinite(buzzScore) ||
    buzzScore < 0 ||
    buzzScore > 100 ||
    typeof mentions !== "number" ||
    !Number.isInteger(mentions) ||
    mentions < 0 ||
    typeof sentimentScore !== "number" ||
    !Number.isFinite(sentimentScore) ||
    sentimentScore < -1 ||
    sentimentScore > 1 ||
    typeof bullishPct !== "number" ||
    !Number.isFinite(bullishPct) ||
    bullishPct < 0 ||
    bullishPct > 100 ||
    typeof bearishPct !== "number" ||
    !Number.isFinite(bearishPct) ||
    bearishPct < 0 ||
    bearishPct > 100
  ) {
    return null;
  }

  const name = value[nameField];
  return {
    symbol,
    name: typeof name === "string" ? name : null,
    buzz_score: buzzScore,
    trend,
    mentions,
    sentiment_score: sentimentScore,
    bullish_pct: bullishPct,
    bearish_pct: bearishPct,
  };
}

export class AdanosSentimentProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async getTrendingStocks(from: string, to: string, limit = 15): Promise<AdanosTrendingAsset[]> {
    const data = await this.request("/reddit/stocks/v1/trending", from, to, {
      limit: String(limit),
      type: "stock",
    });
    if (!Array.isArray(data)) {
      throw new Error("Adanos API returned an invalid trending response");
    }

    return data.flatMap((item) => {
      const asset = parseTrendingAsset(item, "ticker", "company_name");
      return asset ? [asset] : [];
    });
  }

  async getCryptoSentiment(symbols: string[], from: string, to: string): Promise<AdanosTrendingAsset[]> {
    const chunks: string[][] = [];
    for (let index = 0; index < symbols.length; index += MAX_COMPARE_SYMBOLS) {
      chunks.push(symbols.slice(index, index + MAX_COMPARE_SYMBOLS));
    }

    const responses = await Promise.all(
      chunks.map((chunk) =>
        this.request("/reddit/crypto/v1/compare", from, to, {
          symbols: chunk.join(","),
        })
      )
    );

    return responses.flatMap((data) => {
      if (!isRecord(data) || !Array.isArray(data.tokens)) {
        throw new Error("Adanos API returned an invalid crypto compare response");
      }
      return data.tokens.flatMap((item) => {
        const asset = parseTrendingAsset(item, "symbol", "name");
        return asset ? [asset] : [];
      });
    });
  }

  private async request(
    path: string,
    from: string,
    to: string,
    extraParams: Record<string, string> = {}
  ): Promise<unknown> {
    const url = new URL(path, ADANOS_BASE_URL);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetcher(url, {
        headers: { "X-API-Key": this.apiKey },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Adanos API returned HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAdanosSentimentProvider(apiKey: string): AdanosSentimentProvider {
  return new AdanosSentimentProvider(apiKey);
}
