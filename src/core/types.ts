/**
 * Core types shared between the harness orchestrator and strategies.
 *
 * These types are the stable contract — changes here affect all strategies.
 */

// Re-export provider types that strategies need
export type { Account, LLMProvider, MarketClock, OrderStatus, Position } from "../providers/types";

import type { OrderStatus } from "../providers/types";

// Re-export config types
export type { AgentConfig } from "../schemas/agent-config";

// ---------------------------------------------------------------------------
// Signal — produced by data gatherers, consumed by the research & trading loop
// ---------------------------------------------------------------------------

export interface Signal {
  symbol: string;
  source: string;
  source_detail: string;
  sentiment: number;
  raw_sentiment: number;
  volume: number;
  freshness: number;
  source_weight: number;
  reason: string;
  timestamp: number;
  // Optional enrichment fields (gatherers add what they need)
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

// ---------------------------------------------------------------------------
// Position tracking — entry metadata persisted across alarm cycles
// ---------------------------------------------------------------------------

export interface PositionEntry {
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

// ---------------------------------------------------------------------------
// Pending order — tracks submitted orders awaiting fill confirmation
// ---------------------------------------------------------------------------

/** Terminal order states where no further status change is expected. */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "filled",
  "canceled",
  "expired",
  "replaced",
  "rejected",
  "suspended",
]);

/** Pending buy order — awaiting fill to create PositionEntry. */
export interface PendingBuyOrder {
  side: "buy";
  orderId: string;
  symbol: string;
  notional: number;
  reason: string;
  submittedAt: number;
  /** Consecutive getOrder() failures. Cleaned up at MAX_POLL_FAILURES. */
  pollFailures?: number;
  /** Metadata to populate PositionEntry on fill */
  entryMeta: {
    sentiment: number;
    socialVolume: number;
    sources: string[];
  };
}

/** Pending sell order — awaiting fill to compute realized P&L. */
export interface PendingSellOrder {
  side: "sell";
  orderId: string;
  symbol: string;
  reason: string;
  submittedAt: number;
  /** Consecutive getOrder() failures. Cleaned up at MAX_POLL_FAILURES. */
  pollFailures?: number;
  /** Snapshot of entry price from PositionEntry for P&L computation on fill. null if position was not found at sell time. */
  entryPrice: number | null;
}

export type PendingOrder = PendingBuyOrder | PendingSellOrder;

// ---------------------------------------------------------------------------
// Social history — rolling time-series for staleness detection
// ---------------------------------------------------------------------------

export interface SocialHistoryEntry {
  timestamp: number;
  volume: number;
  sentiment: number;
}

export interface SocialSnapshotCacheEntry {
  volume: number;
  sentiment: number;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Logging & cost tracking
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  agent: string;
  action: string;
  [key: string]: unknown;
}

export interface CostTracker {
  total_usd: number;
  calls: number;
  tokens_in: number;
  tokens_out: number;
}

// ---------------------------------------------------------------------------
// Research results — output of LLM analysis
// ---------------------------------------------------------------------------

export interface ResearchResult {
  symbol: string;
  verdict: "BUY" | "SKIP" | "WAIT";
  confidence: number;
  entry_quality: "excellent" | "good" | "fair" | "poor";
  reasoning: string;
  red_flags: string[];
  catalysts: string[];
  timestamp: number;
}

export interface TwitterConfirmation {
  symbol: string;
  tweet_count: number;
  sentiment: number;
  confirms_existing: boolean;
  highlights: Array<{ author: string; text: string; likes: number }>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Pre-market plan
// ---------------------------------------------------------------------------

export interface PremarketPlan {
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

// ---------------------------------------------------------------------------
// Agent state — persisted in DO storage
// ---------------------------------------------------------------------------

export interface AgentState {
  config: import("../schemas/agent-config").AgentConfig;
  signalCache: Signal[];
  positionEntries: Record<string, PositionEntry>;
  pendingOrders: Record<string, PendingOrder>;
  socialHistory: Record<string, SocialHistoryEntry[]>;
  socialSnapshotCache: Record<string, SocialSnapshotCacheEntry>;
  socialSnapshotCacheUpdatedAt: number;
  logs: LogEntry[];
  costTracker: CostTracker;
  lastDataGatherRun: number;
  lastAnalystRun: number;
  lastResearchRun: number;
  lastPositionResearchRun: number;
  signalResearch: Record<string, ResearchResult>;
  positionResearch: Record<string, unknown>;
  stalenessAnalysis: Record<string, unknown>;
  twitterConfirmations: Record<string, TwitterConfirmation>;
  twitterDailyReads: number;
  twitterDailyReadReset: number;
  lastKnownNextOpenMs: number | null;
  premarketPlan: PremarketPlan | null;
  lastPremarketPlanDayEt: string | null;
  lastClockIsOpen: boolean | null;
  enabled: boolean;
}
