/**
 * Ticker extraction and validation helpers for the default strategy.
 */

// ── Blacklist ────────────────────────────────────────────────────────────────
// Common English words and trading slang that look like tickers but aren't.

export const TICKER_BLACKLIST = new Set([
  // Finance/trading terms
  "CEO",
  "CFO",
  "COO",
  "CTO",
  "IPO",
  "EPS",
  "GDP",
  "SEC",
  "FDA",
  "USA",
  "USD",
  "ETF",
  "NYSE",
  "API",
  "ATH",
  "ATL",
  "IMO",
  "FOMO",
  "YOLO",
  "DD",
  "TA",
  "FA",
  "ROI",
  "PE",
  "PB",
  "PS",
  "EV",
  "DCF",
  "WSB",
  "RIP",
  "LOL",
  "OMG",
  "WTF",
  "FUD",
  "HODL",
  "APE",
  "MOASS",
  "DRS",
  "NFT",
  "DAO",
  // Common English words (2-4 letters that look like tickers)
  "THE",
  "AND",
  "FOR",
  "ARE",
  "BUT",
  "NOT",
  "YOU",
  "ALL",
  "CAN",
  "HER",
  "WAS",
  "ONE",
  "OUR",
  "OUT",
  "DAY",
  "HAD",
  "HAS",
  "HIS",
  "HOW",
  "ITS",
  "LET",
  "MAY",
  "NEW",
  "NOW",
  "OLD",
  "SEE",
  "WAY",
  "WHO",
  "BOY",
  "DID",
  "GET",
  "HIM",
  "HIT",
  "LOW",
  "MAN",
  "RUN",
  "SAY",
  "SHE",
  "TOO",
  "USE",
  "DAD",
  "MOM",
  "GOT",
  "PUT",
  "SAW",
  "SAT",
  "SET",
  "SIT",
  "TRY",
  "THAT",
  "THIS",
  "WITH",
  "HAVE",
  "FROM",
  "THEY",
  "BEEN",
  "CALL",
  "WILL",
  "EACH",
  "MAKE",
  "LIKE",
  "TIME",
  "JUST",
  "KNOW",
  "TAKE",
  "COME",
  "MADE",
  "FIND",
  "MORE",
  "LONG",
  "HERE",
  "MANY",
  "SOME",
  "THAN",
  "THEM",
  "THEN",
  "ONLY",
  "OVER",
  "SUCH",
  "YEAR",
  "INTO",
  "MOST",
  "ALSO",
  "BACK",
  "GOOD",
  "WELL",
  "EVEN",
  "WANT",
  "GIVE",
  "MUCH",
  "WORK",
  "FIRST",
  "AFTER",
  "AS",
  "AT",
  "BE",
  "BY",
  "DO",
  "GO",
  "IF",
  "IN",
  "IS",
  "IT",
  "MY",
  "NO",
  "OF",
  "ON",
  "OR",
  "SO",
  "TO",
  "UP",
  "US",
  "WE",
  "AN",
  "AM",
  "AH",
  "OH",
  "OK",
  "HI",
  "YA",
  "YO",
  // More trading slang
  "BULL",
  "BEAR",
  "CALL",
  "PUTS",
  "HOLD",
  "SELL",
  "MOON",
  "PUMP",
  "DUMP",
  "BAGS",
  "TEND",
  // Additional common words that appear as false positives
  "START",
  "ABOUT",
  "NAME",
  "NEXT",
  "PLAY",
  "LIVE",
  "GAME",
  "BEST",
  "LINK",
  "READ",
  "POST",
  "NEWS",
  "FREE",
  "LOOK",
  "HELP",
  "OPEN",
  "FULL",
  "VIEW",
  "REAL",
  "SEND",
  "HIGH",
  "DROP",
  "FAST",
  "SAFE",
  "RISK",
  "TURN",
  "PLAN",
  "DEAL",
  "MOVE",
  "HUGE",
  "EASY",
  "HARD",
  "LATE",
  "WAIT",
  "SOON",
  "STOP",
  "EXIT",
  "GAIN",
  "LOSS",
  "GROW",
  "FALL",
  "JUMP",
  "KEEP",
  "COPY",
  "EDIT",
  "SAVE",
  "NOTE",
  "TIPS",
  "IDEA",
  "PLUS",
  "ZERO",
  "SELF",
  "BOTH",
  "BETA",
  "TEST",
  "INFO",
  "DATA",
  "CASH",
  "WHAT",
  "WHEN",
  "WHERE",
  "WHY",
  "WATCH",
  "LOVE",
  "HATE",
  "TECH",
  "HOPE",
  "FEAR",
  "WEEK",
  "LAST",
  "PART",
  "SIDE",
  "STEP",
  "SURE",
  "TELL",
  "THINK",
  "TOLD",
  "TRUE",
  "TURN",
  "TYPE",
  "UNIT",
  "USED",
  "VERY",
  "WANT",
  "WENT",
  "WERE",
  "YEAH",
  "YOUR",
  "ELSE",
  "AWAY",
  "OTHER",
  "PRICE",
  "THEIR",
  "STILL",
  "CHEAP",
  "THESE",
  "LEAP",
  "EVERY",
  "SINCE",
  "BEING",
  "THOSE",
  "DOING",
  "COULD",
  "WOULD",
  "SHOULD",
  "MIGHT",
  "MUST",
  "SHALL",
]);

// ── Ticker extraction ────────────────────────────────────────────────────────

/**
 * Extract tickers from text using $SYMBOL cashtags and keyword context.
 * Filters against TICKER_BLACKLIST and an optional custom blacklist.
 */
export function extractTickers(text: string, customBlacklist: string[] = []): string[] {
  const matches = new Set<string>();
  const customSet = new Set(customBlacklist.map((t) => t.toUpperCase()));
  const regex =
    /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b(?=\s+(?:calls?|puts?|stock|shares?|moon|rocket|yolo|buy|sell|long|short))/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const ticker = (match[1] || match[2] || "").toUpperCase();
    if (ticker.length >= 2 && ticker.length <= 5 && !TICKER_BLACKLIST.has(ticker) && !customSet.has(ticker)) {
      matches.add(ticker);
    }
  }
  return Array.from(matches);
}

// ── Ticker validation cache ──────────────────────────────────────────────────

export class ValidTickerCache {
  private secTickers: Set<string> | null = null;
  private lastSecRefresh = 0;
  private alpacaCache: Map<string, boolean> = new Map();
  private readonly SEC_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async refreshSecTickersIfNeeded(): Promise<void> {
    if (this.secTickers && Date.now() - this.lastSecRefresh < this.SEC_REFRESH_INTERVAL_MS) {
      return;
    }
    try {
      const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: { "User-Agent": "Mahoraga Trading Bot" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
      this.secTickers = new Set(Object.values(data).map((e) => e.ticker.toUpperCase()));
      this.lastSecRefresh = Date.now();
    } catch {
      // Keep existing cache on failure
    }
  }

  isKnownSecTicker(symbol: string): boolean {
    return this.secTickers?.has(symbol.toUpperCase()) ?? false;
  }

  getCachedValidation(symbol: string): boolean | undefined {
    return this.alpacaCache.get(symbol.toUpperCase());
  }

  setCachedValidation(symbol: string, isValid: boolean): void {
    this.alpacaCache.set(symbol.toUpperCase(), isValid);
  }

  async validateWithAlpaca(
    symbol: string,
    alpaca: { trading: { getAsset(s: string): Promise<{ tradable: boolean } | null> } }
  ): Promise<boolean> {
    const upper = symbol.toUpperCase();
    const cached = this.alpacaCache.get(upper);
    if (cached !== undefined) return cached;

    try {
      const asset = await alpaca.trading.getAsset(upper);
      const isValid = asset !== null && asset.tradable;
      this.alpacaCache.set(upper, isValid);
      return isValid;
    } catch {
      this.alpacaCache.set(upper, false);
      return false;
    }
  }
}

/** Shared singleton instance for ticker validation. */
export const tickerCache = new ValidTickerCache();
