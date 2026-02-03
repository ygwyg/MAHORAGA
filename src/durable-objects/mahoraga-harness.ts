/**
 * MahoragaHarness - Autonomous Trading Agent Durable Object
 * 
 * A fully autonomous trading agent that runs 24/7 on Cloudflare Workers.
 * This is the "harness" - customize it to match your trading strategy.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW TO CUSTOMIZE THIS AGENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. CONFIGURATION (AgentConfig & DEFAULT_CONFIG)
 *    - Tune risk parameters, position sizes, thresholds
 *    - Enable/disable features (options, crypto, staleness)
 *    - Set LLM models and token limits
 * 
 * 2. DATA SOURCES (runDataGatherers, gatherStockTwits, gatherReddit, etc.)
 *    - Add new data sources (news APIs, alternative data)
 *    - Modify scraping logic and sentiment analysis
 *    - Adjust source weights in SOURCE_CONFIG
 * 
 * 3. TRADING LOGIC (runAnalyst, executeBuy, executeSell)
 *    - Change entry/exit rules
 *    - Modify position sizing formulas
 *    - Add custom indicators
 * 
 * 4. LLM PROMPTS (researchSignal, runPreMarketAnalysis)
 *    - Customize how the AI analyzes signals
 *    - Change research criteria and output format
 * 
 * 5. NOTIFICATIONS (sendDiscordNotification)
 *    - Set DISCORD_WEBHOOK_URL secret to enable
 *    - Modify what triggers notifications
 * 
 * Deploy with: wrangler deploy -c wrangler.v2.toml
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.d";
import { createAlpacaProviders } from "../providers/alpaca";
import type { Account, Position, MarketClock, LLMProvider } from "../providers/types";
import { createLLMProvider } from "../providers/llm/factory";

// ============================================================================
// SECTION 1: TYPES & CONFIGURATION
// ============================================================================
// [CUSTOMIZABLE] Modify these interfaces to add new fields for custom data sources.
// [CUSTOMIZABLE] AgentConfig contains ALL tunable parameters - start here!
// ============================================================================

interface AgentConfig {
  // Polling intervals - how often the agent checks for new data
  data_poll_interval_ms: number;   // [TUNE] Default: 30s. Lower = more API calls
  analyst_interval_ms: number;     // [TUNE] Default: 120s. How often to run trading logic

  // Position limits - risk management basics
  max_position_value: number;      // [TUNE] Max $ per position
  max_positions: number;           // [TUNE] Max concurrent positions
  min_sentiment_score: number;     // [TUNE] Min sentiment to consider buying (0-1)
  min_analyst_confidence: number;  // [TUNE] Min LLM confidence to execute (0-1)
  sell_sentiment_threshold: number; // [TUNE] Sentiment below this triggers sell review

  // Risk management - take profit and stop loss
  take_profit_pct: number;         // [TUNE] Take profit at this % gain
  stop_loss_pct: number;           // [TUNE] Stop loss at this % loss
  position_size_pct_of_cash: number; // [TUNE] % of cash per trade

  // Stale position management - exit positions that have lost momentum
  stale_position_enabled: boolean;
  stale_min_hold_hours: number;    // [TUNE] Min hours before checking staleness
  stale_max_hold_days: number;     // [TUNE] Force exit after this many days
  stale_min_gain_pct: number;      // [TUNE] Required gain % to hold past max days
  stale_mid_hold_days: number;
  stale_mid_min_gain_pct: number;
  stale_social_volume_decay: number; // [TUNE] Exit if volume drops to this % of entry
  stale_no_mentions_hours: number;   // [TUNE] Exit if no mentions for N hours

  // LLM configuration
  llm_provider: 'openai-raw' | 'ai-sdk' | 'cloudflare-gateway'; // [TUNE] Provider: openai-raw, ai-sdk, cloudflare-gateway
  llm_model: string;               // [TUNE] Model for quick research (gpt-4o-mini)
  llm_analyst_model: string;       // [TUNE] Model for deep analysis (gpt-4o)
  llm_max_tokens: number;

  // Options trading - trade options instead of shares for high-conviction plays
  options_enabled: boolean;        // [TOGGLE] Enable/disable options trading
  options_min_confidence: number;  // [TUNE] Higher threshold for options (riskier)
  options_max_pct_per_trade: number;
  options_max_total_exposure: number;
  options_min_dte: number;         // [TUNE] Minimum days to expiration
  options_max_dte: number;         // [TUNE] Maximum days to expiration
  options_target_delta: number;    // [TUNE] Target delta (0.3-0.5 typical)
  options_min_delta: number;
  options_max_delta: number;
  options_stop_loss_pct: number;   // [TUNE] Options stop loss (wider than stocks)
  options_take_profit_pct: number; // [TUNE] Options take profit (higher targets)
  options_max_positions: number;

  // Crypto trading - 24/7 momentum-based crypto trading
  crypto_enabled: boolean;         // [TOGGLE] Enable/disable crypto trading
  crypto_symbols: string[];        // [TUNE] Which cryptos to trade (BTC/USD, etc.)
  crypto_momentum_threshold: number; // [TUNE] Min % move to trigger signal
  crypto_max_position_value: number;
  crypto_take_profit_pct: number;
  crypto_stop_loss_pct: number;
}

// [CUSTOMIZABLE] Add fields here when you add new data sources
interface Signal {
  symbol: string;
  source: string;           // e.g., "stocktwits", "reddit", "crypto", "your_source"
  source_detail: string;    // e.g., "reddit_wallstreetbets"
  sentiment: number;        // Weighted sentiment (-1 to 1)
  raw_sentiment: number;    // Raw sentiment before weighting
  volume: number;           // Number of mentions/messages
  freshness: number;        // Time decay factor (0-1)
  source_weight: number;    // How much to trust this source
  reason: string;           // Human-readable reason
  upvotes?: number;
  comments?: number;
  quality_score?: number;
  subreddits?: string[];
  best_flair?: string | null;
  bullish?: number;
  bearish?: number;
  isCrypto?: boolean;
  momentum?: number;
  price?: number;
}

interface PositionEntry {
  symbol: string;
  entry_time: number;
  entry_price: number;
  entry_sentiment: number;
  entry_social_volume: number;
  entry_sources: string[];
  entry_reason: string;
  peak_price: number;
  peak_sentiment: number;
}

interface SocialHistoryEntry {
  timestamp: number;
  volume: number;
  sentiment: number;
}

interface LogEntry {
  timestamp: string;
  agent: string;
  action: string;
  [key: string]: unknown;
}

interface CostTracker {
  total_usd: number;
  calls: number;
  tokens_in: number;
  tokens_out: number;
}

interface ResearchResult {
  symbol: string;
  verdict: "BUY" | "SKIP" | "WAIT";
  confidence: number;
  entry_quality: "excellent" | "good" | "fair" | "poor";
  reasoning: string;
  red_flags: string[];
  catalysts: string[];
  timestamp: number;
}

interface TwitterConfirmation {
  symbol: string;
  tweet_count: number;
  sentiment: number;
  confirms_existing: boolean;
  highlights: Array<{ author: string; text: string; likes: number }>;
  timestamp: number;
}

interface PremarketPlan {
  timestamp: number;
  recommendations: Array<{
    action: "BUY" | "SELL" | "HOLD";
    symbol: string;
    confidence: number;
    reasoning: string;
    suggested_size_pct?: number;
  }>;
  market_summary: string;
  high_conviction: string[];
  researched_buys: ResearchResult[];
}

interface AgentState {
  config: AgentConfig;
  signalCache: Signal[];
  positionEntries: Record<string, PositionEntry>;
  socialHistory: Record<string, SocialHistoryEntry[]>;
  logs: LogEntry[];
  costTracker: CostTracker;
  lastDataGatherRun: number;
  lastAnalystRun: number;
  lastResearchRun: number;
  signalResearch: Record<string, ResearchResult>;
  positionResearch: Record<string, unknown>;
  stalenessAnalysis: Record<string, unknown>;
  twitterConfirmations: Record<string, TwitterConfirmation>;
  twitterDailyReads: number;
  twitterDailyReadReset: number;
  premarketPlan: PremarketPlan | null;
  enabled: boolean;
}

// ============================================================================
// [CUSTOMIZABLE] SOURCE_CONFIG - How much to trust each data source
// ============================================================================
const SOURCE_CONFIG = {
  // [TUNE] Weight each source by reliability (0-1). Higher = more trusted.
  weights: {
    stocktwits: 0.85,           // Decent signal, some noise
    reddit_wallstreetbets: 0.6, // High volume, lots of memes - lower trust
    reddit_stocks: 0.9,         // Higher quality discussions
    reddit_investing: 0.8,      // Long-term focused
    reddit_options: 0.85,       // Options-specific alpha
    twitter_fintwit: 0.95,      // FinTwit has real traders
    twitter_news: 0.9,          // Breaking news accounts
  },
  // [TUNE] Reddit flair multipliers - boost/penalize based on post type
  flairMultipliers: {
    "DD": 1.5,                  // Due Diligence - high value
    "Technical Analysis": 1.3,
    "Fundamentals": 1.3,
    "News": 1.2,
    "Discussion": 1.0,
    "Chart": 1.1,
    "Daily Discussion": 0.7,   // Low signal
    "Weekend Discussion": 0.6,
    "YOLO": 0.6,               // Entertainment, not alpha
    "Gain": 0.5,               // Loss porn - inverse signal?
    "Loss": 0.5,
    "Meme": 0.4,
    "Shitpost": 0.3,
  } as Record<string, number>,
  // [TUNE] Engagement multipliers - more engagement = more trusted
  engagement: {
    upvotes: { 1000: 1.5, 500: 1.3, 200: 1.2, 100: 1.1, 50: 1.0, 0: 0.8 } as Record<number, number>,
    comments: { 200: 1.4, 100: 1.25, 50: 1.15, 20: 1.05, 0: 0.9 } as Record<number, number>,
  },
  // [TUNE] How fast old posts lose weight (minutes). Lower = faster decay.
  decayHalfLifeMinutes: 120,
};

const DEFAULT_CONFIG: AgentConfig = {
  data_poll_interval_ms: 30_000,
  analyst_interval_ms: 120_000,
  max_position_value: 5000,
  max_positions: 5,
  min_sentiment_score: 0.3,
  min_analyst_confidence: 0.6,
  sell_sentiment_threshold: -0.2,
  take_profit_pct: 10,
  stop_loss_pct: 5,
  position_size_pct_of_cash: 25,
  stale_position_enabled: true,
  stale_min_hold_hours: 24,
  stale_max_hold_days: 3,
  stale_min_gain_pct: 5,
  stale_mid_hold_days: 2,
  stale_mid_min_gain_pct: 3,
  stale_social_volume_decay: 0.3,
  stale_no_mentions_hours: 24,
  llm_provider: "openai-raw",
  llm_model: "gpt-4o-mini",
  llm_analyst_model: "gpt-4o",
  llm_max_tokens: 500,
  options_enabled: false,
  options_min_confidence: 0.8,
  options_max_pct_per_trade: 0.02,
  options_max_total_exposure: 0.10,
  options_min_dte: 30,
  options_max_dte: 60,
  options_target_delta: 0.45,
  options_min_delta: 0.30,
  options_max_delta: 0.70,
  options_stop_loss_pct: 50,
  options_take_profit_pct: 100,
  options_max_positions: 3,
  crypto_enabled: false,
  crypto_symbols: ["BTC/USD", "ETH/USD", "SOL/USD"],
  crypto_momentum_threshold: 2.0,
  crypto_max_position_value: 1000,
  crypto_take_profit_pct: 10,
  crypto_stop_loss_pct: 5,
};

const DEFAULT_STATE: AgentState = {
  config: DEFAULT_CONFIG,
  signalCache: [],
  positionEntries: {},
  socialHistory: {},
  logs: [],
  costTracker: { total_usd: 0, calls: 0, tokens_in: 0, tokens_out: 0 },
  lastDataGatherRun: 0,
  lastAnalystRun: 0,
  lastResearchRun: 0,
  signalResearch: {},
  positionResearch: {},
  stalenessAnalysis: {},
  twitterConfirmations: {},
  twitterDailyReads: 0,
  twitterDailyReadReset: 0,
  premarketPlan: null,
  enabled: false,
};

// Blacklist for ticker extraction
const TICKER_BLACKLIST = new Set([
  "CEO", "CFO", "IPO", "EPS", "GDP", "SEC", "FDA", "USA", "USD", "ETF",
  "ATH", "ATL", "IMO", "FOMO", "YOLO", "DD", "TA", "THE", "AND", "FOR",
  "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR",
  "WSB", "RIP", "LOL", "OMG", "WTF", "FUD", "HODL", "APE", "GME", "AMC",
]);

// ============================================================================
// SECTION 2: HELPER FUNCTIONS
// ============================================================================
// [CUSTOMIZABLE] These utilities calculate sentiment weights and extract tickers.
// Modify these to change how posts are scored and filtered.
// ============================================================================

/**
 * [TUNE] Time decay - how quickly old posts lose weight
 * Uses exponential decay with half-life from SOURCE_CONFIG.decayHalfLifeMinutes
 * Modify the min/max clamp values (0.2-1.0) to change bounds
 */
function calculateTimeDecay(postTimestamp: number): number {
  const ageMinutes = (Date.now() - postTimestamp * 1000) / 60000;
  const halfLife = SOURCE_CONFIG.decayHalfLifeMinutes;
  const decay = Math.pow(0.5, ageMinutes / halfLife);
  return Math.max(0.2, Math.min(1.0, decay));
}

function getEngagementMultiplier(upvotes: number, comments: number): number {
  let upvoteMultiplier = 0.8;
  const upvoteThresholds = Object.entries(SOURCE_CONFIG.engagement.upvotes)
    .sort(([a], [b]) => Number(b) - Number(a));
  for (const [threshold, mult] of upvoteThresholds) {
    if (upvotes >= parseInt(threshold)) {
      upvoteMultiplier = mult;
      break;
    }
  }

  let commentMultiplier = 0.9;
  const commentThresholds = Object.entries(SOURCE_CONFIG.engagement.comments)
    .sort(([a], [b]) => Number(b) - Number(a));
  for (const [threshold, mult] of commentThresholds) {
    if (comments >= parseInt(threshold)) {
      commentMultiplier = mult;
      break;
    }
  }

  return (upvoteMultiplier + commentMultiplier) / 2;
}

/** [TUNE] Flair multiplier - boost/penalize based on Reddit post flair */
function getFlairMultiplier(flair: string | null | undefined): number {
  if (!flair) return 1.0;
  return SOURCE_CONFIG.flairMultipliers[flair.trim()] || 1.0;
}

/**
 * [CUSTOMIZABLE] Ticker extraction - modify regex to change what counts as a ticker
 * Current: $SYMBOL or SYMBOL followed by trading keywords
 * Add patterns for your data sources (e.g., cashtags, mentions)
 */
function extractTickers(text: string): string[] {
  const matches = new Set<string>();
  const regex = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b(?=\s+(?:calls?|puts?|stock|shares?|moon|rocket|yolo|buy|sell|long|short))/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const ticker = (match[1] || match[2] || "").toUpperCase();
    if (ticker.length >= 2 && ticker.length <= 5 && !TICKER_BLACKLIST.has(ticker)) {
      matches.add(ticker);
    }
  }
  return Array.from(matches);
}

/**
 * [CUSTOMIZABLE] Sentiment detection - keyword-based bullish/bearish scoring
 * Add/remove words to match your trading style
 * Returns -1 (bearish) to +1 (bullish)
 */
function detectSentiment(text: string): number {
  const lower = text.toLowerCase();
  const bullish = ["moon", "rocket", "buy", "calls", "long", "bullish", "yolo", "tendies", "gains", "diamond", "squeeze", "pump", "green", "up", "breakout", "undervalued", "accumulate"];
  const bearish = ["puts", "short", "sell", "bearish", "crash", "dump", "drill", "tank", "rip", "red", "down", "bag", "overvalued", "bubble", "avoid"];

  let bull = 0, bear = 0;
  for (const w of bullish) if (lower.includes(w)) bull++;
  for (const w of bearish) if (lower.includes(w)) bear++;

  const total = bull + bear;
  if (total === 0) return 0;
  return (bull - bear) / total;
}

// ============================================================================
// SECTION 3: DURABLE OBJECT CLASS
// ============================================================================
// The main agent class. Modify alarm() to change the core loop.
// Add new HTTP endpoints in fetch() for custom dashboard controls.
// ============================================================================

export class MahoragaHarness extends DurableObject<Env> {
  private state: AgentState = { ...DEFAULT_STATE };
  private _llm: LLMProvider | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this._llm = createLLMProvider(env);
    if (this._llm) {
      console.log(`[MahoragaHarness] LLM Provider initialized: ${env.LLM_PROVIDER || "openai-raw"}`);
    } else {
      console.log("[MahoragaHarness] WARNING: No valid LLM provider configured - research disabled");
    }

    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<AgentState>("state");
      if (stored) {
        this.state = { ...DEFAULT_STATE, ...stored };
      }
      this.initializeLLM();
    });
  }

  private initializeLLM() {
    const provider = this.state.config.llm_provider || this.env.LLM_PROVIDER || "openai-raw";
    const model = this.state.config.llm_model || this.env.LLM_MODEL || "gpt-4o-mini";

    const effectiveEnv: Env = {
      ...this.env,
      LLM_PROVIDER: provider as Env["LLM_PROVIDER"],
      LLM_MODEL: model,
    };

    this._llm = createLLMProvider(effectiveEnv);
    if (this._llm) {
      console.log(`[MahoragaHarness] LLM Provider initialized: ${provider} (${model})`);
    } else {
      console.log("[MahoragaHarness] WARNING: No valid LLM provider configured");
    }
  }

  // ============================================================================
  // [CUSTOMIZABLE] ALARM HANDLER - Main entry point for scheduled work
  // ============================================================================
  // This runs every 30 seconds. Modify to change:
  // - What runs and when (intervals, market hours checks)
  // - Order of operations (data → research → trading)
  // - Add new features (e.g., portfolio rebalancing, alerts)
  // ============================================================================

  async alarm(): Promise<void> {
    if (!this.state.enabled) {
      this.log("System", "alarm_skipped", { reason: "Agent not enabled" });
      return;
    }

    const now = Date.now();
    const RESEARCH_INTERVAL_MS = 120_000;
    const POSITION_RESEARCH_INTERVAL_MS = 300_000;

    try {
      const alpaca = createAlpacaProviders(this.env);
      const clock = await alpaca.trading.getClock();

      if (now - this.state.lastDataGatherRun >= this.state.config.data_poll_interval_ms) {
        await this.runDataGatherers();
        this.state.lastDataGatherRun = now;
      }

      if (now - this.state.lastResearchRun >= RESEARCH_INTERVAL_MS) {
        await this.researchTopSignals(5);
        this.state.lastResearchRun = now;
      }

      if (this.isPreMarketWindow() && !this.state.premarketPlan) {
        await this.runPreMarketAnalysis();
      }

      const positions = await alpaca.trading.getPositions();

      if (this.state.config.crypto_enabled) {
        await this.runCryptoTrading(alpaca, positions);
      }

      if (clock.is_open) {
        if (this.isMarketJustOpened() && this.state.premarketPlan) {
          await this.executePremarketPlan();
        }

        if (now - this.state.lastAnalystRun >= this.state.config.analyst_interval_ms) {
          await this.runAnalyst();
          this.state.lastAnalystRun = now;
        }

        if (positions.length > 0 && now - this.state.lastResearchRun >= POSITION_RESEARCH_INTERVAL_MS) {
          for (const pos of positions) {
            if (pos.asset_class !== "us_option") {
              await this.researchPosition(pos.symbol, pos);
            }
          }
        }

        if (this.isOptionsEnabled()) {
          const optionsExits = await this.checkOptionsExits(positions);
          for (const exit of optionsExits) {
            await this.executeSell(alpaca, exit.symbol, exit.reason);
          }
        }

        if (this.isTwitterEnabled()) {
          const heldSymbols = positions.map(p => p.symbol);
          const breakingNews = await this.checkTwitterBreakingNews(heldSymbols);
          for (const news of breakingNews) {
            if (news.is_breaking) {
              this.log("System", "twitter_breaking_news", {
                symbol: news.symbol,
                headline: news.headline.slice(0, 100),
              });
            }
          }
        }
      }

      await this.persist();
    } catch (error) {
      this.log("System", "alarm_error", { error: String(error) });
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const nextRun = Date.now() + 30_000;  // 30 seconds
    await this.ctx.storage.setAlarm(nextRun);
  }

  // ============================================================================
  // HTTP HANDLER (for dashboard/control)
  // ============================================================================
  // Add new endpoints here for custom dashboard controls.
  // Example: /webhook for external alerts, /backtest for simulation
  // ============================================================================

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }

  private isAuthorized(request: Request): boolean {
    const token = this.env.MAHORAGA_API_TOKEN;
    if (!token) {
      console.warn("[MahoragaHarness] MAHORAGA_API_TOKEN not set - denying request");
      return false;
    }
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return false;
    }
    return this.constantTimeCompare(authHeader.slice(7), token);
  }

  private isKillSwitchAuthorized(request: Request): boolean {
    const secret = this.env.KILL_SWITCH_SECRET;
    if (!secret) {
      return false;
    }
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return false;
    }
    return this.constantTimeCompare(authHeader.slice(7), secret);
  }

  private unauthorizedResponse(): Response {
    return new Response(
      JSON.stringify({ error: "Unauthorized. Requires: Authorization: Bearer <MAHORAGA_API_TOKEN>" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.slice(1);

    const protectedActions = ["enable", "disable", "config", "trigger", "status", "logs", "costs", "signals", "setup/status"];
    if (protectedActions.includes(action)) {
      if (!this.isAuthorized(request)) {
        return this.unauthorizedResponse();
      }
    }

    try {
      switch (action) {
        case "status":
          return this.handleStatus();

        case "setup/status":
          return this.jsonResponse({ ok: true, data: { configured: true } });

        case "config":
          if (request.method === "POST") {
            return this.handleUpdateConfig(request);
          }
          return this.jsonResponse({ ok: true, data: this.state.config });

        case "enable":
          return this.handleEnable();

        case "disable":
          return this.handleDisable();

        case "logs":
          return this.handleGetLogs(url);

        case "costs":
          return this.jsonResponse({ costs: this.state.costTracker });

        case "signals":
          return this.jsonResponse({ signals: this.state.signalCache });

        case "trigger":
          await this.alarm();
          return this.jsonResponse({ ok: true, message: "Alarm triggered" });

        case "kill":
          if (!this.isKillSwitchAuthorized(request)) {
            return new Response(
              JSON.stringify({ error: "Forbidden. Requires: Authorization: Bearer <KILL_SWITCH_SECRET>" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
          return this.handleKillSwitch();

        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private async handleStatus(): Promise<Response> {
    const alpaca = createAlpacaProviders(this.env);

    let account: Account | null = null;
    let positions: Position[] = [];
    let clock: MarketClock | null = null;

    try {
      [account, positions, clock] = await Promise.all([
        alpaca.trading.getAccount(),
        alpaca.trading.getPositions(),
        alpaca.trading.getClock(),
      ]);
    } catch (e) {
      // Ignore - will return null
    }

    return this.jsonResponse({
      ok: true,
      data: {
        enabled: this.state.enabled,
        account,
        positions,
        clock,
        config: this.state.config,
        signals: this.state.signalCache,
        logs: this.state.logs.slice(-100),
        costs: this.state.costTracker,
        lastAnalystRun: this.state.lastAnalystRun,
        lastResearchRun: this.state.lastResearchRun,
        signalResearch: this.state.signalResearch,
        positionResearch: this.state.positionResearch,
        positionEntries: this.state.positionEntries,
        twitterConfirmations: this.state.twitterConfirmations,
        premarketPlan: this.state.premarketPlan,
        stalenessAnalysis: this.state.stalenessAnalysis,
      },
    });
  }

  private async handleUpdateConfig(request: Request): Promise<Response> {
    const body = await request.json() as Partial<AgentConfig>;
    this.state.config = { ...this.state.config, ...body };
    this.initializeLLM();
    await this.persist();
    return this.jsonResponse({ ok: true, config: this.state.config });
  }

  private async handleEnable(): Promise<Response> {
    this.state.enabled = true;
    await this.persist();
    await this.scheduleNextAlarm();
    this.log("System", "agent_enabled", {});
    return this.jsonResponse({ ok: true, enabled: true });
  }

  private async handleDisable(): Promise<Response> {
    this.state.enabled = false;
    await this.ctx.storage.deleteAlarm();
    await this.persist();
    this.log("System", "agent_disabled", {});
    return this.jsonResponse({ ok: true, enabled: false });
  }

  private handleGetLogs(url: URL): Response {
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const logs = this.state.logs.slice(-limit);
    return this.jsonResponse({ logs });
  }

  private async handleKillSwitch(): Promise<Response> {
    this.state.enabled = false;
    await this.ctx.storage.deleteAlarm();
    this.state.signalCache = [];
    this.state.signalResearch = {};
    this.state.premarketPlan = null;
    await this.persist();
    this.log("System", "kill_switch_activated", { timestamp: new Date().toISOString() });
    return this.jsonResponse({
      ok: true,
      message: "KILL SWITCH ACTIVATED. Agent disabled, alarms cancelled, signal cache cleared.",
      note: "Existing positions are NOT automatically closed. Review and close manually if needed."
    });
  }

  // ============================================================================
  // SECTION 4: DATA GATHERING
  // ============================================================================
  // [CUSTOMIZABLE] This is where you add NEW DATA SOURCES.
  // 
  // To add a new source:
  // 1. Create a new gather method (e.g., gatherNewsAPI)
  // 2. Add it to runDataGatherers() Promise.all
  // 3. Add source weight to SOURCE_CONFIG.weights
  // 4. Return Signal[] with your source name
  //
  // Each gatherer returns Signal[] which get merged into signalCache.
  // ============================================================================

  private async runDataGatherers(): Promise<void> {
    this.log("System", "gathering_data", {});

    const [stocktwitsSignals, redditSignals, cryptoSignals] = await Promise.all([
      this.gatherStockTwits(),
      this.gatherReddit(),
      this.gatherCrypto(),
    ]);

    this.state.signalCache = [...stocktwitsSignals, ...redditSignals, ...cryptoSignals];

    this.log("System", "data_gathered", {
      stocktwits: stocktwitsSignals.length,
      reddit: redditSignals.length,
      crypto: cryptoSignals.length,
      total: this.state.signalCache.length,
    });
  }

  private async gatherStockTwits(): Promise<Signal[]> {
    const signals: Signal[] = [];
    const sourceWeight = SOURCE_CONFIG.weights.stocktwits;

    try {
      // Get trending symbols
      const trendingRes = await fetch("https://api.stocktwits.com/api/2/trending/symbols.json");
      if (!trendingRes.ok) return [];
      const trendingData = await trendingRes.json() as { symbols?: Array<{ symbol: string }> };
      const trending = trendingData.symbols || [];

      // Get sentiment for top trending
      for (const sym of trending.slice(0, 15)) {
        try {
          const streamRes = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${sym.symbol}.json?limit=30`);
          if (!streamRes.ok) continue;
          const streamData = await streamRes.json() as { messages?: Array<{ entities?: { sentiment?: { basic?: string } }; created_at?: string }> };
          const messages = streamData.messages || [];

          // Analyze sentiment
          let bullish = 0, bearish = 0, totalTimeDecay = 0;
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
            });
          }

          await this.sleep(200);
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.log("StockTwits", "error", { message: String(error) });
    }

    return signals;
  }

  private async gatherReddit(): Promise<Signal[]> {
    const subreddits = ["wallstreetbets", "stocks", "investing", "options"];
    const tickerData = new Map<string, {
      mentions: number;
      weightedSentiment: number;
      rawSentiment: number;
      totalQuality: number;
      upvotes: number;
      comments: number;
      sources: Set<string>;
      bestFlair: string | null;
      bestFlairMult: number;
      freshestPost: number;
    }>();

    for (const sub of subreddits) {
      const sourceWeight = SOURCE_CONFIG.weights[`reddit_${sub}` as keyof typeof SOURCE_CONFIG.weights] || 0.7;

      try {
        const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
          headers: { "User-Agent": "Mahoraga/2.0" },
        });
        if (!res.ok) continue;
        const data = await res.json() as { data?: { children?: Array<{ data: { title?: string; selftext?: string; created_utc?: number; ups?: number; num_comments?: number; link_flair_text?: string } }> } };
        const posts = data.data?.children?.map(c => c.data) || [];

        for (const post of posts) {
          const text = `${post.title || ""} ${post.selftext || ""}`;
          const tickers = extractTickers(text);
          const rawSentiment = detectSentiment(text);

          const timeDecay = calculateTimeDecay(post.created_utc || Date.now() / 1000);
          const engagementMult = getEngagementMultiplier(post.ups || 0, post.num_comments || 0);
          const flairMult = getFlairMultiplier(post.link_flair_text);
          const qualityScore = timeDecay * engagementMult * flairMult * sourceWeight;

          for (const ticker of tickers) {
            if (!tickerData.has(ticker)) {
              tickerData.set(ticker, {
                mentions: 0,
                weightedSentiment: 0,
                rawSentiment: 0,
                totalQuality: 0,
                upvotes: 0,
                comments: 0,
                sources: new Set(),
                bestFlair: null,
                bestFlairMult: 0,
                freshestPost: 0,
              });
            }
            const d = tickerData.get(ticker)!;
            d.mentions++;
            d.rawSentiment += rawSentiment;
            d.weightedSentiment += rawSentiment * qualityScore;
            d.totalQuality += qualityScore;
            d.upvotes += post.ups || 0;
            d.comments += post.num_comments || 0;
            d.sources.add(sub);

            if (flairMult > d.bestFlairMult) {
              d.bestFlair = post.link_flair_text || null;
              d.bestFlairMult = flairMult;
            }

            if ((post.created_utc || 0) > d.freshestPost) {
              d.freshestPost = post.created_utc || 0;
            }
          }
        }

        await this.sleep(1000);
      } catch {
        continue;
      }
    }

    const signals: Signal[] = [];
    for (const [symbol, data] of tickerData) {
      if (data.mentions >= 2) {
        const avgRawSentiment = data.rawSentiment / data.mentions;
        const avgQuality = data.totalQuality / data.mentions;
        const finalSentiment = data.totalQuality > 0
          ? data.weightedSentiment / data.mentions
          : avgRawSentiment * 0.5;
        const freshness = calculateTimeDecay(data.freshestPost);

        signals.push({
          symbol,
          source: "reddit",
          source_detail: `reddit_${Array.from(data.sources).join("+")}`,
          sentiment: finalSentiment,
          raw_sentiment: avgRawSentiment,
          volume: data.mentions,
          upvotes: data.upvotes,
          comments: data.comments,
          quality_score: avgQuality,
          freshness,
          best_flair: data.bestFlair,
          subreddits: Array.from(data.sources),
          source_weight: avgQuality,
          reason: `Reddit(${Array.from(data.sources).join(",")}): ${data.mentions} mentions, ${data.upvotes} upvotes, quality:${(avgQuality * 100).toFixed(0)}%`,
        });
      }
    }

    return signals;
  }

  private async gatherCrypto(): Promise<Signal[]> {
    if (!this.state.config.crypto_enabled) return [];

    const signals: Signal[] = [];
    const symbols = this.state.config.crypto_symbols || ["BTC/USD", "ETH/USD", "SOL/USD"];
    const alpaca = createAlpacaProviders(this.env);

    for (const symbol of symbols) {
      try {
        const snapshot = await alpaca.marketData.getCryptoSnapshot(symbol);
        if (!snapshot) continue;

        const price = snapshot.latest_trade?.price || 0;
        const prevClose = snapshot.prev_daily_bar?.c || 0;

        if (!price || !prevClose) continue;

        const momentum = ((price - prevClose) / prevClose) * 100;
        const threshold = this.state.config.crypto_momentum_threshold || 2.0;
        const hasSignificantMove = Math.abs(momentum) >= threshold;
        const isBullish = momentum > 0;

        const rawSentiment = hasSignificantMove && isBullish ? Math.min(Math.abs(momentum) / 5, 1) : 0.1;

        signals.push({
          symbol,
          source: "crypto",
          source_detail: "crypto_momentum",
          sentiment: rawSentiment,
          raw_sentiment: rawSentiment,
          volume: snapshot.daily_bar?.v || 0,
          freshness: 1.0,
          source_weight: 0.8,
          reason: `Crypto: ${momentum >= 0 ? '+' : ''}${momentum.toFixed(2)}% (24h)`,
          bullish: isBullish ? 1 : 0,
          bearish: isBullish ? 0 : 1,
          isCrypto: true,
          momentum,
          price,
        });

        await this.sleep(200);
      } catch (error) {
        this.log("Crypto", "error", { symbol, message: String(error) });
      }
    }

    this.log("Crypto", "gathered_signals", { count: signals.length });
    return signals;
  }

  private async runCryptoTrading(
    alpaca: ReturnType<typeof createAlpacaProviders>,
    positions: Position[]
  ): Promise<void> {
    if (!this.state.config.crypto_enabled) return;

    const cryptoSymbols = new Set(this.state.config.crypto_symbols || []);
    const cryptoPositions = positions.filter(p => cryptoSymbols.has(p.symbol) || p.symbol.includes("/"));
    const heldCrypto = new Set(cryptoPositions.map(p => p.symbol));

    for (const pos of cryptoPositions) {
      const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100;

      if (plPct >= this.state.config.crypto_take_profit_pct) {
        this.log("Crypto", "take_profit", { symbol: pos.symbol, pnl: plPct.toFixed(2) });
        await this.executeSell(alpaca, pos.symbol, `Crypto take profit at +${plPct.toFixed(1)}%`);
        continue;
      }

      if (plPct <= -this.state.config.crypto_stop_loss_pct) {
        this.log("Crypto", "stop_loss", { symbol: pos.symbol, pnl: plPct.toFixed(2) });
        await this.executeSell(alpaca, pos.symbol, `Crypto stop loss at ${plPct.toFixed(1)}%`);
        continue;
      }
    }

    const maxCryptoPositions = Math.min(this.state.config.crypto_symbols?.length || 3, 3);
    if (cryptoPositions.length >= maxCryptoPositions) return;

    const cryptoSignals = this.state.signalCache
      .filter(s => s.isCrypto)
      .filter(s => !heldCrypto.has(s.symbol))
      .filter(s => s.sentiment > 0)
      .sort((a, b) => (b.momentum || 0) - (a.momentum || 0));

    for (const signal of cryptoSignals.slice(0, 2)) {
      if (cryptoPositions.length >= maxCryptoPositions) break;

      const existingResearch = this.state.signalResearch[signal.symbol];
      const CRYPTO_RESEARCH_TTL_MS = 300_000;

      let research: ResearchResult | null = existingResearch ?? null;
      if (!existingResearch || Date.now() - existingResearch.timestamp > CRYPTO_RESEARCH_TTL_MS) {
        research = await this.researchCrypto(signal.symbol, signal.momentum || 0, signal.sentiment);
      }

      if (!research || research.verdict !== "BUY") {
        this.log("Crypto", "research_skip", {
          symbol: signal.symbol,
          verdict: research?.verdict || "NO_RESEARCH",
          confidence: research?.confidence || 0
        });
        continue;
      }

      if (research.confidence < this.state.config.min_analyst_confidence) {
        this.log("Crypto", "low_confidence", { symbol: signal.symbol, confidence: research.confidence });
        continue;
      }

      const account = await alpaca.trading.getAccount();
      const result = await this.executeCryptoBuy(alpaca, signal.symbol, research.confidence, account);

      if (result) {
        heldCrypto.add(signal.symbol);
        cryptoPositions.push({ symbol: signal.symbol } as Position);
        break;
      }
    }
  }

  private async researchCrypto(
    symbol: string,
    momentum: number,
    sentiment: number
  ): Promise<ResearchResult | null> {
    if (!this._llm) {
      this.log("Crypto", "skipped_no_llm", { symbol, reason: "LLM Provider not configured" });
      return null;
    }

    try {
      const alpaca = createAlpacaProviders(this.env);
      const snapshot = await alpaca.marketData.getCryptoSnapshot(symbol).catch(() => null);
      const price = snapshot?.latest_trade?.price || 0;
      const dailyChange = snapshot ? ((snapshot.daily_bar.c - snapshot.prev_daily_bar.c) / snapshot.prev_daily_bar.c) * 100 : 0;

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

      const response = await this._llm.complete({
        model: this.state.config.llm_model, // Use config model (usually cheap one)
        messages: [
          { role: "system", content: "You are a crypto analyst. Be skeptical of FOMO. Crypto is volatile - only recommend BUY for strong setups. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 250,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const usage = response.usage;
      if (usage) {
        this.trackLLMCost(this.state.config.llm_model, usage.prompt_tokens, usage.completion_tokens);
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

      this.state.signalResearch[symbol] = result;
      this.log("Crypto", "researched", {
        symbol,
        verdict: result.verdict,
        confidence: result.confidence,
        quality: result.entry_quality,
      });

      return result;
    } catch (error) {
      this.log("Crypto", "research_error", { symbol, error: String(error) });
      return null;
    }
  }

  private async executeCryptoBuy(
    alpaca: ReturnType<typeof createAlpacaProviders>,
    symbol: string,
    confidence: number,
    account: Account
  ): Promise<boolean> {
    const sizePct = Math.min(20, this.state.config.position_size_pct_of_cash);
    const positionSize = Math.min(
      account.cash * (sizePct / 100) * confidence,
      this.state.config.crypto_max_position_value
    );

    if (positionSize < 10) {
      this.log("Crypto", "buy_skipped", { symbol, reason: "Position too small" });
      return false;
    }

    try {
      const order = await alpaca.trading.createOrder({
        symbol,
        notional: Math.round(positionSize * 100) / 100,
        side: "buy",
        type: "market",
        time_in_force: "gtc",
      });

      this.log("Crypto", "buy_executed", { symbol, status: order.status, size: positionSize });
      return true;
    } catch (error) {
      this.log("Crypto", "buy_failed", { symbol, error: String(error) });
      return false;
    }
  }

  // ============================================================================
  // SECTION 5: TWITTER INTEGRATION
  // ============================================================================
  // [TOGGLE] Enable with TWITTER_BEARER_TOKEN secret
  // [TUNE] MAX_DAILY_READS controls API budget (default: 200/day)
  // 
  // Twitter is used for CONFIRMATION only - it boosts/reduces confidence
  // on signals from other sources, doesn't generate signals itself.
  // ============================================================================

  private isTwitterEnabled(): boolean {
    return !!this.env.TWITTER_BEARER_TOKEN;
  }

  private canSpendTwitterRead(): boolean {
    const ONE_DAY_MS = 86400_000;
    const MAX_DAILY_READS = 200;

    const now = Date.now();
    if (now - this.state.twitterDailyReadReset > ONE_DAY_MS) {
      this.state.twitterDailyReads = 0;
      this.state.twitterDailyReadReset = now;
    }
    return this.state.twitterDailyReads < MAX_DAILY_READS;
  }

  private spendTwitterRead(count = 1): void {
    this.state.twitterDailyReads += count;
    this.log("Twitter", "read_spent", {
      count,
      daily_total: this.state.twitterDailyReads,
      budget_remaining: 200 - this.state.twitterDailyReads,
    });
  }

  private async twitterSearchRecent(query: string, maxResults = 10): Promise<Array<{
    id: string;
    text: string;
    created_at: string;
    author: string;
    author_followers: number;
    retweets: number;
    likes: number;
  }>> {
    if (!this.isTwitterEnabled() || !this.canSpendTwitterRead()) return [];

    try {
      const params = new URLSearchParams({
        query,
        max_results: Math.min(maxResults, 10).toString(),
        "tweet.fields": "created_at,public_metrics,author_id",
        expansions: "author_id",
        "user.fields": "username,public_metrics",
      });

      const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
        headers: {
          Authorization: `Bearer ${this.env.TWITTER_BEARER_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        this.log("Twitter", "api_error", { status: res.status });
        return [];
      }

      const data = await res.json() as {
        data?: Array<{
          id: string;
          text: string;
          created_at: string;
          author_id: string;
          public_metrics?: { retweet_count?: number; like_count?: number };
        }>;
        includes?: {
          users?: Array<{
            id: string;
            username: string;
            public_metrics?: { followers_count?: number };
          }>;
        };
      };

      this.spendTwitterRead(1);

      return (data.data || []).map(tweet => {
        const user = data.includes?.users?.find(u => u.id === tweet.author_id);
        return {
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author: user?.username || "unknown",
          author_followers: user?.public_metrics?.followers_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          likes: tweet.public_metrics?.like_count || 0,
        };
      });
    } catch (error) {
      this.log("Twitter", "error", { message: String(error) });
      return [];
    }
  }

  private async gatherTwitterConfirmation(symbol: string, existingSentiment: number): Promise<TwitterConfirmation | null> {
    const MIN_SENTIMENT_FOR_CONFIRMATION = 0.3;
    const CACHE_TTL_MS = 300_000;

    if (!this.isTwitterEnabled() || !this.canSpendTwitterRead()) return null;
    if (Math.abs(existingSentiment) < MIN_SENTIMENT_FOR_CONFIRMATION) return null;

    const cached = this.state.twitterConfirmations[symbol];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }

    const actionableKeywords = ["unusual", "flow", "sweep", "block", "whale", "breaking", "alert", "upgrade", "downgrade"];
    const query = `$${symbol} (${actionableKeywords.slice(0, 5).join(" OR ")}) -is:retweet lang:en`;
    const tweets = await this.twitterSearchRecent(query, 10);

    if (tweets.length === 0) return null;

    let bullish = 0, bearish = 0, totalWeight = 0;
    const highlights: Array<{ author: string; text: string; likes: number }> = [];

    const bullWords = ["buy", "call", "long", "bullish", "upgrade", "beat", "squeeze", "moon", "breakout"];
    const bearWords = ["sell", "put", "short", "bearish", "downgrade", "miss", "crash", "dump", "breakdown"];

    for (const tweet of tweets) {
      const text = tweet.text.toLowerCase();

      const authorWeight = Math.min(1.5, Math.log10(tweet.author_followers + 1) / 5);
      const engagementWeight = Math.min(1.3, 1 + (tweet.likes + tweet.retweets * 2) / 1000);
      const weight = authorWeight * engagementWeight;

      let sentiment = 0;
      for (const w of bullWords) if (text.includes(w)) sentiment += 1;
      for (const w of bearWords) if (text.includes(w)) sentiment -= 1;

      if (sentiment > 0) bullish += weight;
      else if (sentiment < 0) bearish += weight;
      totalWeight += weight;

      if (tweet.likes > 50 || tweet.author_followers > 10000) {
        highlights.push({
          author: tweet.author,
          text: tweet.text.slice(0, 150),
          likes: tweet.likes,
        });
      }
    }

    const twitterSentiment = totalWeight > 0 ? (bullish - bearish) / totalWeight : 0;
    const twitterBullish = twitterSentiment > 0.2;
    const twitterBearish = twitterSentiment < -0.2;
    const existingBullish = existingSentiment > 0;

    const result: TwitterConfirmation = {
      symbol,
      tweet_count: tweets.length,
      sentiment: twitterSentiment,
      confirms_existing: (twitterBullish && existingBullish) || (twitterBearish && !existingBullish),
      highlights: highlights.slice(0, 3),
      timestamp: Date.now(),
    };

    this.state.twitterConfirmations[symbol] = result;
    this.log("Twitter", "signal_confirmed", {
      symbol,
      sentiment: twitterSentiment.toFixed(2),
      confirms: result.confirms_existing,
      tweet_count: tweets.length,
    });

    return result;
  }

  private async checkTwitterBreakingNews(symbols: string[]): Promise<Array<{
    symbol: string;
    headline: string;
    author: string;
    age_minutes: number;
    is_breaking: boolean;
  }>> {
    if (!this.isTwitterEnabled() || !this.canSpendTwitterRead() || symbols.length === 0) return [];

    const toCheck = symbols.slice(0, 3);
    const newsQuery = `(from:FirstSquawk OR from:DeItaone OR from:Newsquawk) (${toCheck.map(s => `$${s}`).join(" OR ")}) -is:retweet`;
    const tweets = await this.twitterSearchRecent(newsQuery, 5);

    const results: Array<{
      symbol: string;
      headline: string;
      author: string;
      age_minutes: number;
      is_breaking: boolean;
    }> = [];

    const MAX_NEWS_AGE_MS = 1800_000;
    const BREAKING_THRESHOLD_MS = 600_000;

    for (const tweet of tweets) {
      const tweetAge = Date.now() - new Date(tweet.created_at).getTime();
      if (tweetAge > MAX_NEWS_AGE_MS) continue;

      const mentionedSymbol = toCheck.find(s =>
        tweet.text.toUpperCase().includes(`$${s}`) ||
        tweet.text.toUpperCase().includes(` ${s} `)
      );

      if (mentionedSymbol) {
        results.push({
          symbol: mentionedSymbol,
          headline: tweet.text.slice(0, 200),
          author: tweet.author,
          age_minutes: Math.round(tweetAge / 60000),
          is_breaking: tweetAge < BREAKING_THRESHOLD_MS,
        });
      }
    }

    if (results.length > 0) {
      this.log("Twitter", "breaking_news_found", {
        count: results.length,
        symbols: results.map(r => r.symbol),
      });
    }

    return results;
  }

  // ============================================================================
  // SECTION 6: LLM RESEARCH
  // ============================================================================
  // [CUSTOMIZABLE] Modify prompts to change how the AI analyzes signals.
  // 
  // Key methods:
  // - researchSignal(): Evaluates individual symbols (BUY/SKIP/WAIT)
  // - researchPosition(): Analyzes held positions (HOLD/SELL/ADD)
  // - analyzeSignalsWithLLM(): Batch analysis for trading decisions
  //
  // [TUNE] Change llm_model and llm_analyst_model in config for cost/quality
  // ============================================================================

  private async researchSignal(
    symbol: string,
    sentimentScore: number,
    sources: string[]
  ): Promise<ResearchResult | null> {
    if (!this._llm) {
      this.log("SignalResearch", "skipped_no_llm", { symbol, reason: "LLM Provider not configured" });
      return null;
    }

    const cached = this.state.signalResearch[symbol];
    const CACHE_TTL_MS = 180_000;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }

    try {
      const alpaca = createAlpacaProviders(this.env);
      const quote = await alpaca.marketData.getQuote(symbol).catch(() => null);
      const price = quote?.ask_price || quote?.bid_price || 0;

      const prompt = `Should we BUY this stock based on social sentiment and fundamentals?

SYMBOL: ${symbol}
SENTIMENT: ${(sentimentScore * 100).toFixed(0)}% bullish (sources: ${sources.join(", ")})

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
}`;

      const response = await this._llm.complete({
        model: this.state.config.llm_model,
        messages: [
          { role: "system", content: "You are a stock research analyst. Be skeptical of hype. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 250,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const usage = response.usage;
      if (usage) {
        this.trackLLMCost(this.state.config.llm_model, usage.prompt_tokens, usage.completion_tokens);
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

      this.state.signalResearch[symbol] = result;
      this.log("SignalResearch", "signal_researched", {
        symbol,
        verdict: result.verdict,
        confidence: result.confidence,
        quality: result.entry_quality,
      });

      if (result.verdict === "BUY") {
        await this.sendDiscordNotification("research", {
          symbol: result.symbol,
          verdict: result.verdict,
          confidence: result.confidence,
          quality: result.entry_quality,
          sentiment: sentimentScore,
          sources,
          reasoning: result.reasoning,
          catalysts: result.catalysts,
          red_flags: result.red_flags,
        });
      }

      return result;
    } catch (error) {
      this.log("SignalResearch", "error", { symbol, message: String(error) });
      return null;
    }
  }

  private async researchTopSignals(limit = 5): Promise<ResearchResult[]> {
    const alpaca = createAlpacaProviders(this.env);
    const positions = await alpaca.trading.getPositions();
    const heldSymbols = new Set(positions.map(p => p.symbol));

    const allSignals = this.state.signalCache;
    const notHeld = allSignals.filter(s => !heldSymbols.has(s.symbol));
    // Use raw_sentiment for threshold (before weighting), weighted sentiment for sorting
    const aboveThreshold = notHeld.filter(s => s.raw_sentiment >= this.state.config.min_sentiment_score);
    const candidates = aboveThreshold
      .sort((a, b) => b.sentiment - a.sentiment)
      .slice(0, limit);

    if (candidates.length === 0) {
      this.log("SignalResearch", "no_candidates", {
        total_signals: allSignals.length,
        not_held: notHeld.length,
        above_threshold: aboveThreshold.length,
        min_sentiment: this.state.config.min_sentiment_score,
      });
      return [];
    }

    this.log("SignalResearch", "researching_signals", { count: candidates.length });

    const aggregated = new Map<string, { symbol: string; sentiment: number; sources: string[] }>();
    for (const sig of candidates) {
      if (!aggregated.has(sig.symbol)) {
        aggregated.set(sig.symbol, { symbol: sig.symbol, sentiment: sig.sentiment, sources: [sig.source] });
      } else {
        aggregated.get(sig.symbol)!.sources.push(sig.source);
      }
    }

    const results: ResearchResult[] = [];
    for (const [symbol, data] of aggregated) {
      const analysis = await this.researchSignal(symbol, data.sentiment, data.sources);
      if (analysis) {
        results.push(analysis);
      }
      await this.sleep(500);
    }

    return results;
  }

  private async researchPosition(
    symbol: string,
    position: Position
  ): Promise<{
    recommendation: "SELL" | "HOLD" | "ADD";
    risk_level: "low" | "medium" | "high";
    reasoning: string;
    key_factors: string[];
  } | null> {
    if (!this._llm) return null;

    const plPct = (position.unrealized_pl / (position.market_value - position.unrealized_pl)) * 100;

    const prompt = `Analyze this position for risk and opportunity:

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
}`;

    try {
      const response = await this._llm.complete({
        model: this.state.config.llm_model,
        messages: [
          { role: "system", content: "You are a position risk analyst. Be concise. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const usage = response.usage;
      if (usage) {
        this.trackLLMCost(this.state.config.llm_model, usage.prompt_tokens, usage.completion_tokens);
      }

      const content = response.content || "{}";
      const analysis = JSON.parse(content.replace(/```json\n?|```/g, "").trim()) as {
        recommendation: "HOLD" | "SELL" | "ADD";
        risk_level: "low" | "medium" | "high";
        reasoning: string;
        key_factors: string[];
      };

      this.state.positionResearch[symbol] = { ...analysis, timestamp: Date.now() };
      this.log("PositionResearch", "position_analyzed", {
        symbol,
        recommendation: analysis.recommendation,
        risk: analysis.risk_level,
      });

      return analysis;
    } catch (error) {
      this.log("PositionResearch", "error", { symbol, message: String(error) });
      return null;
    }
  }

  private async analyzeSignalsWithLLM(
    signals: Signal[],
    positions: Position[],
    account: Account
  ): Promise<{
    recommendations: Array<{
      action: "BUY" | "SELL" | "HOLD";
      symbol: string;
      confidence: number;
      reasoning: string;
      suggested_size_pct?: number;
    }>;
    market_summary: string;
    high_conviction: string[];
  }> {
    if (!this._llm || signals.length === 0) {
      return { recommendations: [], market_summary: "No signals to analyze", high_conviction: [] };
    }

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
      .map(a => ({ ...a, avgSentiment: a.totalSentiment / a.count }))
      .filter(a => a.avgSentiment >= this.state.config.min_sentiment_score * 0.5)
      .sort((a, b) => b.avgSentiment - a.avgSentiment)
      .slice(0, 10);

    if (candidates.length === 0) {
      return { recommendations: [], market_summary: "No candidates above threshold", high_conviction: [] };
    }

    const positionSymbols = new Set(positions.map(p => p.symbol));
    const prompt = `Current Time: ${new Date().toISOString()}

ACCOUNT STATUS:
- Equity: $${account.equity.toFixed(2)}
- Cash: $${account.cash.toFixed(2)}
- Current Positions: ${positions.length}/${this.state.config.max_positions}

CURRENT POSITIONS:
${positions.length === 0 ? "None" : positions.map(p =>
      `- ${p.symbol}: ${p.qty} shares, P&L: $${p.unrealized_pl.toFixed(2)} (${((p.unrealized_pl / (p.market_value - p.unrealized_pl)) * 100).toFixed(1)}%)`
    ).join("\n")}

TOP SENTIMENT CANDIDATES:
${candidates.map(c =>
      `- ${c.symbol}: avg sentiment ${(c.avgSentiment * 100).toFixed(0)}%, sources: ${c.sources.join(", ")}, ${positionSymbols.has(c.symbol) ? "[CURRENTLY HELD]" : "[NOT HELD]"}`
    ).join("\n")}

RAW SIGNALS (top 20):
${signals.slice(0, 20).map(s =>
      `- ${s.symbol} (${s.source}): ${s.reason}`
    ).join("\n")}

TRADING RULES:
- Max position size: $${this.state.config.max_position_value}
- Take profit target: ${this.state.config.take_profit_pct}%
- Stop loss: ${this.state.config.stop_loss_pct}%
- Min confidence to trade: ${this.state.config.min_analyst_confidence}

Analyze and provide BUY/SELL/HOLD recommendations:`;

    try {
      const response = await this._llm.complete({
        model: this.state.config.llm_analyst_model,
        messages: [
          {
            role: "system",
            content: `You are a senior trading analyst AI. Make the FINAL trading decisions based on social sentiment signals.

Rules:
- Only recommend BUY for symbols with strong conviction from multiple data points
- Recommend SELL for positions with deteriorating sentiment or hitting targets
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
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.4,
        response_format: { type: "json_object" }
      });

      const usage = response.usage;
      if (usage) {
        this.trackLLMCost(this.state.config.llm_analyst_model, usage.prompt_tokens, usage.completion_tokens);
      }

      const content = response.content || "{}";
      const analysis = JSON.parse(content.replace(/```json\n?|```/g, "").trim()) as {
        recommendations: Array<{
          action: "BUY" | "SELL" | "HOLD";
          symbol: string;
          confidence: number;
          reasoning: string;
          suggested_size_pct?: number;
        }>;
        market_summary: string;
        high_conviction_plays?: string[];
      };

      this.log("Analyst", "analysis_complete", {
        candidates: candidates.length,
        recommendations: analysis.recommendations?.length || 0,
      });

      return {
        recommendations: analysis.recommendations || [],
        market_summary: analysis.market_summary || "",
        high_conviction: analysis.high_conviction_plays || [],
      };
    } catch (error) {
      this.log("Analyst", "error", { message: String(error) });
      return { recommendations: [], market_summary: `Analysis failed: ${error}`, high_conviction: [] };
    }
  }

  // ============================================================================
  // SECTION 7: ANALYST & TRADING LOGIC
  // ============================================================================
  // [CUSTOMIZABLE] Core trading decision logic lives here.
  //
  // runAnalyst(): Main trading loop - checks exits, then looks for entries
  // executeBuy(): Position sizing and order execution
  // executeSell(): Closes positions with reason logging
  //
  // [TUNE] Position sizing formula in executeBuy()
  // [TUNE] Entry/exit conditions in runAnalyst()
  // ============================================================================

  private async runAnalyst(): Promise<void> {
    const alpaca = createAlpacaProviders(this.env);

    const [account, positions, clock] = await Promise.all([
      alpaca.trading.getAccount(),
      alpaca.trading.getPositions(),
      alpaca.trading.getClock(),
    ]);

    if (!account || !clock.is_open) {
      this.log("System", "analyst_skipped", { reason: "Account unavailable or market closed" });
      return;
    }

    const heldSymbols = new Set(positions.map(p => p.symbol));

    // Check position exits
    for (const pos of positions) {
      if (pos.asset_class === "us_option") continue;  // Options handled separately

      const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100;

      // Take profit
      if (plPct >= this.state.config.take_profit_pct) {
        await this.executeSell(alpaca, pos.symbol, `Take profit at +${plPct.toFixed(1)}%`);
        continue;
      }

      // Stop loss
      if (plPct <= -this.state.config.stop_loss_pct) {
        await this.executeSell(alpaca, pos.symbol, `Stop loss at ${plPct.toFixed(1)}%`);
        continue;
      }

      // Check staleness
      if (this.state.config.stale_position_enabled) {
        const stalenessResult = this.analyzeStaleness(pos.symbol, pos.current_price, 0);
        this.state.stalenessAnalysis[pos.symbol] = stalenessResult;

        if (stalenessResult.isStale) {
          await this.executeSell(alpaca, pos.symbol, `STALE: ${stalenessResult.reason}`);
        }
      }
    }

    if (positions.length < this.state.config.max_positions && this.state.signalCache.length > 0) {
      const researchedBuys = Object.values(this.state.signalResearch)
        .filter(r => r.verdict === "BUY" && r.confidence >= this.state.config.min_analyst_confidence)
        .filter(r => !heldSymbols.has(r.symbol))
        .sort((a, b) => b.confidence - a.confidence);

      for (const research of researchedBuys.slice(0, 3)) {
        if (positions.length >= this.state.config.max_positions) break;
        if (heldSymbols.has(research.symbol)) continue;

        const originalSignal = this.state.signalCache.find(s => s.symbol === research.symbol);
        let finalConfidence = research.confidence;

        if (this.isTwitterEnabled() && originalSignal) {
          const twitterConfirm = await this.gatherTwitterConfirmation(research.symbol, originalSignal.sentiment);
          if (twitterConfirm?.confirms_existing) {
            finalConfidence = Math.min(1.0, finalConfidence * 1.15);
            this.log("System", "twitter_boost", { symbol: research.symbol, new_confidence: finalConfidence });
          } else if (twitterConfirm && !twitterConfirm.confirms_existing && twitterConfirm.sentiment !== 0) {
            finalConfidence = finalConfidence * 0.85;
          }
        }

        if (finalConfidence < this.state.config.min_analyst_confidence) continue;

        const shouldUseOptions = this.isOptionsEnabled() &&
          finalConfidence >= this.state.config.options_min_confidence &&
          research.entry_quality === "excellent";

        if (shouldUseOptions) {
          const contract = await this.findBestOptionsContract(research.symbol, "bullish", account.equity);
          if (contract) {
            const optionsResult = await this.executeOptionsOrder(contract, 1, account.equity);
            if (optionsResult) {
              this.log("System", "options_position_opened", { symbol: research.symbol, contract: contract.symbol });
            }
          }
        }

        const result = await this.executeBuy(alpaca, research.symbol, finalConfidence, account);
        if (result) {
          heldSymbols.add(research.symbol);
          this.state.positionEntries[research.symbol] = {
            symbol: research.symbol,
            entry_time: Date.now(),
            entry_price: 0,
            entry_sentiment: originalSignal?.sentiment || finalConfidence,
            entry_social_volume: originalSignal?.volume || 0,
            entry_sources: originalSignal?.subreddits || [originalSignal?.source || "research"],
            entry_reason: research.reasoning,
            peak_price: 0,
            peak_sentiment: originalSignal?.sentiment || finalConfidence,
          };
        }
      }

      if (positions.length < this.state.config.max_positions) {
        const analysis = await this.analyzeSignalsWithLLM(this.state.signalCache, positions, account);
        const researchedSymbols = new Set(researchedBuys.map(r => r.symbol));

        for (const rec of analysis.recommendations) {
          if (positions.length >= this.state.config.max_positions) break;
          if (rec.action !== "BUY" || rec.confidence < this.state.config.min_analyst_confidence) continue;
          if (heldSymbols.has(rec.symbol)) continue;
          if (researchedSymbols.has(rec.symbol)) continue;

          const result = await this.executeBuy(alpaca, rec.symbol, rec.confidence, account);
          if (result) {
            const originalSignal = this.state.signalCache.find(s => s.symbol === rec.symbol);
            heldSymbols.add(rec.symbol);
            this.state.positionEntries[rec.symbol] = {
              symbol: rec.symbol,
              entry_time: Date.now(),
              entry_price: 0,
              entry_sentiment: originalSignal?.sentiment || rec.confidence,
              entry_social_volume: originalSignal?.volume || 0,
              entry_sources: originalSignal?.subreddits || [originalSignal?.source || "analyst"],
              entry_reason: rec.reasoning,
              peak_price: 0,
              peak_sentiment: originalSignal?.sentiment || rec.confidence,
            };
          }
        }
      }
    }
  }

  private async executeBuy(
    alpaca: ReturnType<typeof createAlpacaProviders>,
    symbol: string,
    confidence: number,
    account: Account
  ): Promise<boolean> {
    const sizePct = Math.min(20, this.state.config.position_size_pct_of_cash);
    const positionSize = Math.min(
      account.cash * (sizePct / 100) * confidence,
      this.state.config.max_position_value
    );

    if (positionSize < 100) {
      this.log("Executor", "buy_skipped", { symbol, reason: "Position too small" });
      return false;
    }

    try {
      const order = await alpaca.trading.createOrder({
        symbol,
        notional: Math.round(positionSize * 100) / 100,
        side: "buy",
        type: "market",
        time_in_force: "day",
      });

      this.log("Executor", "buy_executed", { symbol, status: order.status, size: positionSize });
      return true;
    } catch (error) {
      this.log("Executor", "buy_failed", { symbol, error: String(error) });
      return false;
    }
  }

  private async executeSell(
    alpaca: ReturnType<typeof createAlpacaProviders>,
    symbol: string,
    reason: string
  ): Promise<boolean> {
    try {
      await alpaca.trading.closePosition(symbol);
      this.log("Executor", "sell_executed", { symbol, reason });

      // Clean up tracking
      delete this.state.positionEntries[symbol];
      delete this.state.socialHistory[symbol];
      delete this.state.stalenessAnalysis[symbol];

      return true;
    } catch (error) {
      this.log("Executor", "sell_failed", { symbol, error: String(error) });
      return false;
    }
  }

  // ============================================================================
  // SECTION 8: STALENESS DETECTION
  // ============================================================================
  // [TOGGLE] Enable with stale_position_enabled in config
  // [TUNE] Staleness thresholds (hold time, volume decay, gain requirements)
  //
  // Staleness = positions that lost momentum. Scored 0-100 based on:
  // - Time held (vs max hold days)
  // - Price action (P&L vs targets)
  // - Social volume decay (vs entry volume)
  // ============================================================================

  private analyzeStaleness(symbol: string, currentPrice: number, currentSocialVolume: number): {
    isStale: boolean;
    reason: string;
    staleness_score: number;
  } {
    const entry = this.state.positionEntries[symbol];
    if (!entry) {
      return { isStale: false, reason: "No entry data", staleness_score: 0 };
    }

    const holdHours = (Date.now() - entry.entry_time) / (1000 * 60 * 60);
    const holdDays = holdHours / 24;
    const pnlPct = entry.entry_price > 0
      ? ((currentPrice - entry.entry_price) / entry.entry_price) * 100
      : 0;

    if (holdHours < this.state.config.stale_min_hold_hours) {
      return { isStale: false, reason: `Too early (${holdHours.toFixed(1)}h)`, staleness_score: 0 };
    }

    let stalenessScore = 0;

    // Time-based (max 40 points)
    if (holdDays >= this.state.config.stale_max_hold_days) {
      stalenessScore += 40;
    } else if (holdDays >= this.state.config.stale_mid_hold_days) {
      stalenessScore += 20 * (holdDays - this.state.config.stale_mid_hold_days) /
        (this.state.config.stale_max_hold_days - this.state.config.stale_mid_hold_days);
    }

    // Price action (max 30 points)
    if (pnlPct < 0) {
      stalenessScore += Math.min(30, Math.abs(pnlPct) * 3);
    } else if (pnlPct < this.state.config.stale_mid_min_gain_pct && holdDays >= this.state.config.stale_mid_hold_days) {
      stalenessScore += 15;
    }

    // Social volume decay (max 30 points)
    const volumeRatio = entry.entry_social_volume > 0
      ? currentSocialVolume / entry.entry_social_volume
      : 1;
    if (volumeRatio <= this.state.config.stale_social_volume_decay) {
      stalenessScore += 30;
    } else if (volumeRatio <= 0.5) {
      stalenessScore += 15;
    }

    stalenessScore = Math.min(100, stalenessScore);

    const isStale = stalenessScore >= 70 ||
      (holdDays >= this.state.config.stale_max_hold_days && pnlPct < this.state.config.stale_min_gain_pct);

    return {
      isStale,
      reason: isStale
        ? `Staleness score ${stalenessScore}/100, held ${holdDays.toFixed(1)} days`
        : `OK (score ${stalenessScore}/100)`,
      staleness_score: stalenessScore,
    };
  }

  // ============================================================================
  // SECTION 9: OPTIONS TRADING
  // ============================================================================
  // [TOGGLE] Enable with options_enabled in config
  // [TUNE] Delta, DTE, and position size limits in config
  //
  // Options are used for HIGH CONVICTION plays only (confidence >= 0.8).
  // Finds ATM/ITM calls for bullish signals, puts for bearish.
  // Wider stop-loss (50%) and higher take-profit (100%) than stocks.
  // ============================================================================

  private isOptionsEnabled(): boolean {
    return this.state.config.options_enabled === true;
  }

  private async findBestOptionsContract(
    symbol: string,
    direction: "bullish" | "bearish",
    equity: number
  ): Promise<{
    symbol: string;
    strike: number;
    expiration: string;
    delta: number;
    mid_price: number;
    max_contracts: number;
  } | null> {
    if (!this.isOptionsEnabled()) return null;

    try {
      const alpaca = createAlpacaProviders(this.env);
      const expirations = await alpaca.options.getExpirations(symbol);

      if (!expirations || expirations.length === 0) {
        this.log("Options", "no_expirations", { symbol });
        return null;
      }

      const today = new Date();
      const validExpirations = expirations.filter(exp => {
        const expDate = new Date(exp);
        const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return dte >= this.state.config.options_min_dte && dte <= this.state.config.options_max_dte;
      });

      if (validExpirations.length === 0) {
        this.log("Options", "no_valid_expirations", { symbol });
        return null;
      }

      const targetDTE = (this.state.config.options_min_dte + this.state.config.options_max_dte) / 2;
      const bestExpiration = validExpirations.reduce((best: string, exp: string) => {
        const expDate = new Date(exp);
        const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const currentBestDte = Math.ceil((new Date(best).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return Math.abs(dte - targetDTE) < Math.abs(currentBestDte - targetDTE) ? exp : best;
      }, validExpirations[0]!);

      const chain = await alpaca.options.getChain(symbol, bestExpiration);
      if (!chain) {
        this.log("Options", "chain_failed", { symbol, expiration: bestExpiration });
        return null;
      }

      const contracts = direction === "bullish" ? chain.calls : chain.puts;
      if (!contracts || contracts.length === 0) {
        this.log("Options", "no_contracts", { symbol, direction });
        return null;
      }

      const quote = await alpaca.marketData.getQuote(symbol);
      const stockPrice = quote?.ask_price || quote?.bid_price || 0;
      if (stockPrice === 0) return null;

      const targetStrike = direction === "bullish"
        ? stockPrice * (1 - (this.state.config.options_target_delta - 0.5) * 0.2)
        : stockPrice * (1 + (this.state.config.options_target_delta - 0.5) * 0.2);

      const sortedContracts = contracts
        .filter(c => c.strike > 0)
        .sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike));

      for (const contract of sortedContracts.slice(0, 5)) {
        const snapshot = await alpaca.options.getSnapshot(contract.symbol);
        if (!snapshot) continue;

        const delta = snapshot.greeks?.delta;
        const absDelta = delta !== undefined ? Math.abs(delta) : null;

        if (absDelta === null || absDelta < this.state.config.options_min_delta || absDelta > this.state.config.options_max_delta) {
          continue;
        }

        const bid = snapshot.latest_quote?.bid_price || 0;
        const ask = snapshot.latest_quote?.ask_price || 0;
        if (bid === 0 || ask === 0) continue;

        const spread = (ask - bid) / ask;
        if (spread > 0.10) continue;

        const midPrice = (bid + ask) / 2;
        const maxCost = equity * this.state.config.options_max_pct_per_trade;
        const maxContracts = Math.floor(maxCost / (midPrice * 100));

        if (maxContracts < 1) continue;

        this.log("Options", "contract_selected", {
          symbol,
          contract: contract.symbol,
          strike: contract.strike,
          expiration: bestExpiration,
          delta: delta?.toFixed(3),
          mid_price: midPrice.toFixed(2),
        });

        return {
          symbol: contract.symbol,
          strike: contract.strike,
          expiration: bestExpiration,
          delta: delta!,
          mid_price: midPrice,
          max_contracts: maxContracts,
        };
      }

      return null;
    } catch (error) {
      this.log("Options", "error", { symbol, message: String(error) });
      return null;
    }
  }

  private async executeOptionsOrder(
    contract: { symbol: string; mid_price: number },
    quantity: number,
    equity: number
  ): Promise<boolean> {
    if (!this.isOptionsEnabled()) return false;

    const totalCost = contract.mid_price * quantity * 100;
    const maxAllowed = equity * this.state.config.options_max_pct_per_trade;

    if (totalCost > maxAllowed) {
      quantity = Math.floor(maxAllowed / (contract.mid_price * 100));
      if (quantity < 1) {
        this.log("Options", "skipped_size", { contract: contract.symbol, cost: totalCost, max: maxAllowed });
        return false;
      }
    }

    try {
      const alpaca = createAlpacaProviders(this.env);
      const order = await alpaca.trading.createOrder({
        symbol: contract.symbol,
        qty: quantity,
        side: "buy",
        type: "limit",
        limit_price: Math.round(contract.mid_price * 100) / 100,
        time_in_force: "day",
      });

      this.log("Options", "options_buy_executed", {
        contract: contract.symbol,
        qty: quantity,
        status: order.status,
        estimated_cost: (contract.mid_price * quantity * 100).toFixed(2),
      });

      return true;
    } catch (error) {
      this.log("Options", "options_buy_failed", { contract: contract.symbol, error: String(error) });
      return false;
    }
  }

  private async checkOptionsExits(positions: Position[]): Promise<Array<{
    symbol: string;
    reason: string;
    type: string;
    pnl_pct: number;
  }>> {
    if (!this.isOptionsEnabled()) return [];

    const exits: Array<{ symbol: string; reason: string; type: string; pnl_pct: number }> = [];
    const optionsPositions = positions.filter(p => p.asset_class === "us_option");

    for (const pos of optionsPositions) {
      const entryPrice = pos.avg_entry_price || pos.current_price;
      const plPct = entryPrice > 0 ? ((pos.current_price - entryPrice) / entryPrice) * 100 : 0;

      if (plPct <= -this.state.config.options_stop_loss_pct) {
        exits.push({
          symbol: pos.symbol,
          reason: `Options stop loss at ${plPct.toFixed(1)}%`,
          type: "stop_loss",
          pnl_pct: plPct,
        });
        continue;
      }

      if (plPct >= this.state.config.options_take_profit_pct) {
        exits.push({
          symbol: pos.symbol,
          reason: `Options take profit at +${plPct.toFixed(1)}%`,
          type: "take_profit",
          pnl_pct: plPct,
        });
        continue;
      }
    }

    return exits;
  }

  // ============================================================================
  // SECTION 10: PRE-MARKET ANALYSIS
  // ============================================================================
  // Runs 9:25-9:29 AM ET to prepare a trading plan before market open.
  // Executes the plan at 9:30-9:32 AM when market opens.
  //
  // [TUNE] Change time windows in isPreMarketWindow() / isMarketJustOpened()
  // [TUNE] Plan staleness (PLAN_STALE_MS) in executePremarketPlan()
  // ============================================================================

  private isPreMarketWindow(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();

    if (day >= 1 && day <= 5) {
      if (hour === 9 && minute >= 25 && minute <= 29) {
        return true;
      }
    }
    return false;
  }

  private isMarketJustOpened(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();

    if (day >= 1 && day <= 5) {
      if (hour === 9 && minute >= 30 && minute <= 32) {
        return true;
      }
    }
    return false;
  }

  private async runPreMarketAnalysis(): Promise<void> {
    const alpaca = createAlpacaProviders(this.env);
    const [account, positions] = await Promise.all([
      alpaca.trading.getAccount(),
      alpaca.trading.getPositions(),
    ]);

    if (!account || this.state.signalCache.length === 0) return;

    this.log("System", "premarket_analysis_starting", {
      signals: this.state.signalCache.length,
      researched: Object.keys(this.state.signalResearch).length,
    });

    const signalResearch = await this.researchTopSignals(10);
    const analysis = await this.analyzeSignalsWithLLM(this.state.signalCache, positions, account);

    this.state.premarketPlan = {
      timestamp: Date.now(),
      recommendations: analysis.recommendations.map(r => ({
        action: r.action,
        symbol: r.symbol,
        confidence: r.confidence,
        reasoning: r.reasoning,
        suggested_size_pct: r.suggested_size_pct,
      })),
      market_summary: analysis.market_summary,
      high_conviction: analysis.high_conviction,
      researched_buys: signalResearch.filter(r => r.verdict === "BUY"),
    };

    const buyRecs = this.state.premarketPlan.recommendations.filter(r => r.action === "BUY").length;
    const sellRecs = this.state.premarketPlan.recommendations.filter(r => r.action === "SELL").length;

    this.log("System", "premarket_analysis_complete", {
      buy_recommendations: buyRecs,
      sell_recommendations: sellRecs,
      high_conviction: this.state.premarketPlan.high_conviction,
    });
  }

  private async executePremarketPlan(): Promise<void> {
    const PLAN_STALE_MS = 600_000;

    if (!this.state.premarketPlan || Date.now() - this.state.premarketPlan.timestamp > PLAN_STALE_MS) {
      this.log("System", "no_premarket_plan", { reason: "Plan missing or stale" });
      return;
    }

    const alpaca = createAlpacaProviders(this.env);
    const [account, positions] = await Promise.all([
      alpaca.trading.getAccount(),
      alpaca.trading.getPositions(),
    ]);

    if (!account) return;

    const heldSymbols = new Set(positions.map(p => p.symbol));

    this.log("System", "executing_premarket_plan", {
      recommendations: this.state.premarketPlan.recommendations.length,
    });

    for (const rec of this.state.premarketPlan.recommendations) {
      if (rec.action === "SELL" && rec.confidence >= this.state.config.min_analyst_confidence) {
        await this.executeSell(alpaca, rec.symbol, `Pre-market plan: ${rec.reasoning}`);
      }
    }

    for (const rec of this.state.premarketPlan.recommendations) {
      if (rec.action === "BUY" && rec.confidence >= this.state.config.min_analyst_confidence) {
        if (heldSymbols.has(rec.symbol)) continue;
        if (positions.length >= this.state.config.max_positions) break;

        const result = await this.executeBuy(alpaca, rec.symbol, rec.confidence, account);
        if (result) {
          heldSymbols.add(rec.symbol);

          const originalSignal = this.state.signalCache.find(s => s.symbol === rec.symbol);
          this.state.positionEntries[rec.symbol] = {
            symbol: rec.symbol,
            entry_time: Date.now(),
            entry_price: 0,
            entry_sentiment: originalSignal?.sentiment || 0,
            entry_social_volume: originalSignal?.volume || 0,
            entry_sources: originalSignal?.subreddits || [originalSignal?.source || "premarket"],
            entry_reason: rec.reasoning,
            peak_price: 0,
            peak_sentiment: originalSignal?.sentiment || 0,
          };
        }
      }
    }

    this.state.premarketPlan = null;
  }

  // ============================================================================
  // SECTION 11: UTILITIES
  // ============================================================================
  // Logging, cost tracking, persistence, and Discord notifications.
  // Generally don't need to modify unless adding new notification channels.
  // ============================================================================

  private log(agent: string, action: string, details: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      agent,
      action,
      ...details,
    };
    this.state.logs.push(entry);

    // Keep last 500 logs
    if (this.state.logs.length > 500) {
      this.state.logs = this.state.logs.slice(-500);
    }

    // Log to console for wrangler tail
    console.log(`[${entry.timestamp}] [${agent}] ${action}`, JSON.stringify(details));
  }

  public trackLLMCost(model: string, tokensIn: number, tokensOut: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 2.5, output: 10 },
      "gpt-4o-mini": { input: 0.15, output: 0.6 },
    };

    const rates = pricing[model] ?? pricing["gpt-4o"]!;
    const cost = (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;

    this.state.costTracker.total_usd += cost;
    this.state.costTracker.calls++;
    this.state.costTracker.tokens_in += tokensIn;
    this.state.costTracker.tokens_out += tokensOut;

    return cost;
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("state", this.state);
  }

  private jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get llm(): LLMProvider | null {
    return this._llm;
  }

  private discordCooldowns: Map<string, number> = new Map();
  private readonly DISCORD_COOLDOWN_MS = 30 * 60 * 1000;

  private async sendDiscordNotification(
    type: "signal" | "research",
    data: {
      symbol: string;
      sentiment?: number;
      sources?: string[];
      verdict?: string;
      confidence?: number;
      quality?: string;
      reasoning?: string;
      catalysts?: string[];
      red_flags?: string[];
    }
  ): Promise<void> {
    if (!this.env.DISCORD_WEBHOOK_URL) return;

    const cacheKey = data.symbol;
    const lastNotification = this.discordCooldowns.get(cacheKey);
    if (lastNotification && Date.now() - lastNotification < this.DISCORD_COOLDOWN_MS) {
      return;
    }

    try {
      let embed: {
        title: string;
        color: number;
        fields: Array<{ name: string; value: string; inline: boolean }>;
        description?: string;
        timestamp: string;
        footer: { text: string };
      };

      if (type === "signal") {
        embed = {
          title: `🔔 SIGNAL: $${data.symbol}`,
          color: 0xfbbf24,
          fields: [
            { name: "Sentiment", value: `${((data.sentiment || 0) * 100).toFixed(0)}% bullish`, inline: true },
            { name: "Sources", value: data.sources?.join(", ") || "StockTwits", inline: true },
          ],
          description: "High sentiment detected, researching...",
          timestamp: new Date().toISOString(),
          footer: { text: "MAHORAGA • Not financial advice • DYOR" },
        };
      } else {
        const verdictEmoji = data.verdict === "BUY" ? "✅" : data.verdict === "SKIP" ? "⏭️" : "⏸️";
        const color = data.verdict === "BUY" ? 0x22c55e : data.verdict === "SKIP" ? 0x6b7280 : 0xfbbf24;

        embed = {
          title: `${verdictEmoji} $${data.symbol} → ${data.verdict}`,
          color,
          fields: [
            { name: "Confidence", value: `${((data.confidence || 0) * 100).toFixed(0)}%`, inline: true },
            { name: "Quality", value: data.quality || "N/A", inline: true },
            { name: "Sentiment", value: `${((data.sentiment || 0) * 100).toFixed(0)}%`, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: "MAHORAGA • Not financial advice • DYOR" },
        };

        if (data.reasoning) {
          embed.description = data.reasoning.substring(0, 300) + (data.reasoning.length > 300 ? "..." : "");
        }

        if (data.catalysts && data.catalysts.length > 0) {
          embed.fields.push({ name: "Catalysts", value: data.catalysts.slice(0, 3).join(", "), inline: false });
        }

        if (data.red_flags && data.red_flags.length > 0) {
          embed.fields.push({ name: "⚠️ Red Flags", value: data.red_flags.slice(0, 3).join(", "), inline: false });
        }
      }

      await fetch(this.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      this.discordCooldowns.set(cacheKey, Date.now());
      this.log("Discord", "notification_sent", { type, symbol: data.symbol });
    } catch (err) {
      this.log("Discord", "notification_failed", { error: String(err) });
    }
  }
}

// ============================================================================
// SECTION 12: EXPORTS & HELPERS
// ============================================================================
// Helper functions to interact with the DO from your worker.
// ============================================================================

export function getHarnessStub(env: Env): DurableObjectStub {
  if (!env.MAHORAGA_HARNESS) {
    throw new Error("MAHORAGA_HARNESS binding not configured - check wrangler.toml");
  }
  const id = env.MAHORAGA_HARNESS.idFromName("main");
  return env.MAHORAGA_HARNESS.get(id);
}

export async function getHarnessStatus(env: Env): Promise<unknown> {
  const stub = getHarnessStub(env);
  const response = await stub.fetch(new Request("http://harness/status"));
  return response.json();
}

export async function enableHarness(env: Env): Promise<void> {
  const stub = getHarnessStub(env);
  await stub.fetch(new Request("http://harness/enable"));
}

export async function disableHarness(env: Env): Promise<void> {
  const stub = getHarnessStub(env);
  await stub.fetch(new Request("http://harness/disable"));
}
