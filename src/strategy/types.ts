/**
 * Strategy Interface — the contract for customizable trading strategies.
 *
 * Users implement this interface to define their own trading strategy.
 * The core harness orchestrates the alarm loop, state persistence, auth,
 * and PolicyEngine enforcement. The strategy provides:
 *   - Data gatherers (what signals to collect)
 *   - LLM prompts (how to research signals)
 *   - Entry/exit rules (when to buy/sell)
 *   - Config defaults and optional schema extensions
 */

import type { z } from "zod";
import type {
  Account,
  AgentConfig,
  LLMProvider,
  MarketClock,
  Position,
  PositionEntry,
  ResearchResult,
  Signal,
} from "../core/types";
import type { Env } from "../env.d";
import type { OptionsContract } from "./default/rules/options";

// ---------------------------------------------------------------------------
// StrategyContext — passed to every strategy hook
// ---------------------------------------------------------------------------

export interface StrategyContext {
  /** Cloudflare Worker environment bindings */
  env: Env;

  /** The current merged + validated config */
  config: AgentConfig;

  /** LLM provider (null if no LLM keys configured) */
  llm: LLMProvider | null;

  /** Append a log entry */
  log: (agent: string, action: string, details: Record<string, unknown>) => void;

  /** Track LLM token usage and cost. Returns the estimated cost in USD. */
  trackLLMCost: (model: string, tokensIn: number, tokensOut: number) => number;

  /** Async sleep */
  sleep: (ms: number) => Promise<void>;

  /**
   * Broker adapter — all orders are automatically validated by PolicyEngine.
   * Strategies cannot bypass kill switch, daily loss limits, position limits, etc.
   */
  broker: {
    getAccount(): Promise<Account>;
    getPositions(): Promise<Position[]>;
    getClock(): Promise<MarketClock>;
    /** Execute a buy. Returns the order id on success, null on rejection/failure. */
    buy(symbol: string, notional: number, reason: string): Promise<{ orderId: string } | null>;
    /** Execute an options buy. Returns the order id on success, null on rejection/failure. */
    buyOption(contract: OptionsContract, qty: number, reason: string): Promise<{ orderId: string } | null>;
    /** Close a position. Returns the order id on success, null on rejection/failure. */
    sell(symbol: string, reason: string): Promise<{ orderId: string } | null>;
  };

  /**
   * Strategy-scoped persistent state.
   * Use this to store custom data across alarm cycles (e.g., custom caches).
   * Persisted in the Durable Object storage alongside core state.
   */
  state: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
  };

  /** Current signal cache for this cycle */
  signals: Signal[];

  /** Position entry metadata tracked by core */
  positionEntries: Record<string, PositionEntry>;
}

// ---------------------------------------------------------------------------
// Prompt builders — strategy provides the text, core calls the LLM
// ---------------------------------------------------------------------------

export interface PromptTemplate {
  system: string;
  user: string;
  /** Override the model for this prompt (defaults to config.llm_model) */
  model?: string;
  /** Override max tokens (defaults vary by prompt type) */
  maxTokens?: number;
}

export type ResearchSignalPromptBuilder = (
  symbol: string,
  sentiment: number,
  sources: string[],
  price: number,
  ctx: StrategyContext
) => PromptTemplate;

export type ResearchPositionPromptBuilder = (
  symbol: string,
  position: Position,
  plPct: number,
  ctx: StrategyContext
) => PromptTemplate;

export type AnalyzeSignalsPromptBuilder = (
  signals: Signal[],
  positions: Position[],
  account: Account,
  ctx: StrategyContext
) => PromptTemplate;

export type PremarketPromptBuilder = (
  signals: Signal[],
  positions: Position[],
  account: Account,
  ctx: StrategyContext
) => PromptTemplate;

// ---------------------------------------------------------------------------
// Entry/exit candidates — strategy returns these, core executes them
// ---------------------------------------------------------------------------

export interface BuyCandidate {
  symbol: string;
  confidence: number;
  reason: string;
  /** Dollar amount to buy */
  notional: number;
  /** Hint to core to route through options trading */
  useOptions?: boolean;
}

export interface SellCandidate {
  symbol: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Gatherer — a named data source that produces signals
// ---------------------------------------------------------------------------

export interface Gatherer {
  name: string;
  gather: (ctx: StrategyContext) => Promise<Signal[]>;
}

// ---------------------------------------------------------------------------
// Strategy — THE main interface
// ---------------------------------------------------------------------------

export interface Strategy {
  /** Unique strategy name (used in logging and leaderboard display) */
  name: string;

  /**
   * Optional Zod schema extending the base AgentConfigSchema.
   * Core validates this on config updates.
   * Return null to use the base config as-is.
   */
  configSchema: z.ZodType | null;

  /** Default config values (merged over core defaults at startup) */
  defaultConfig: Partial<AgentConfig>;

  /**
   * Data gatherers. Core calls all of them in parallel each data-gather cycle,
   * merges results, deduplicates by symbol+source, and caps at MAX_SIGNALS.
   */
  gatherers: Gatherer[];

  /** LLM prompt templates. Set to null to skip that research phase. */
  prompts: {
    researchSignal: ResearchSignalPromptBuilder | null;
    researchPosition: ResearchPositionPromptBuilder | null;
    analyzeSignals: AnalyzeSignalsPromptBuilder | null;
    premarketAnalysis: PremarketPromptBuilder | null;
  };

  /**
   * Entry rules. Given LLM-researched signals, decide what to buy.
   * Core handles PolicyEngine checks and actual order execution.
   * Core ALWAYS enforces stop-loss from config as a safety floor.
   */
  selectEntries: (
    ctx: StrategyContext,
    research: ResearchResult[],
    positions: Position[],
    account: Account
  ) => BuyCandidate[];

  /**
   * Exit rules. Given current positions, decide what to sell.
   * Core calls this every analyst cycle.
   * Core ALWAYS enforces stop-loss/take-profit from config on top of this.
   */
  selectExits: (ctx: StrategyContext, positions: Position[], account: Account) => SellCandidate[];

  /** Optional lifecycle hooks */
  hooks?: {
    /** Called once on DO initialization (after state hydration) */
    onInit?: (ctx: StrategyContext) => Promise<void>;
    /** Called at the start of each alarm cycle */
    onCycleStart?: (ctx: StrategyContext, clock: MarketClock) => Promise<void>;
    /** Called at the end of each alarm cycle */
    onCycleEnd?: (ctx: StrategyContext) => Promise<void>;
    /** Called after a successful buy */
    onBuy?: (ctx: StrategyContext, symbol: string, notional: number) => Promise<void>;
    /** Called after a successful sell */
    onSell?: (ctx: StrategyContext, symbol: string, reason: string) => Promise<void>;
  };
}
