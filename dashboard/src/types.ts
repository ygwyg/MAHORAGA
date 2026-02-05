export interface Account {
  equity: number
  cash: number
  buying_power: number
  portfolio_value: number
}

export interface Position {
  symbol: string
  qty: number
  side: string
  market_value: number
  unrealized_pl: number
  current_price: number
}

export interface Clock {
  is_open: boolean
  next_open: string
  next_close: string
}

export interface Signal {
  symbol: string
  source: string
  sentiment: number
  volume: number
  reason: string
  bullish?: number
  bearish?: number
  score?: number
  upvotes?: number
  isCrypto?: boolean
  momentum?: number
  price?: number
}

export interface LogEntry {
  timestamp: string
  agent: string
  action: string
  symbol?: string
  [key: string]: unknown
}

export interface CostTracker {
  total_usd: number
  calls: number
  tokens_in: number
  tokens_out: number
}

import type { AgentConfig } from "../../src/schemas/agent-config"
export type Config = AgentConfig

export interface SignalResearch {
  verdict: 'BUY' | 'SKIP' | 'WAIT'
  confidence: number
  entry_quality: 'excellent' | 'good' | 'fair' | 'poor'
  reasoning: string
  red_flags: string[]
  catalysts: string[]
  sentiment: number
  timestamp: number
}

export interface PositionResearch {
  recommendation: 'HOLD' | 'SELL' | 'ADD'
  risk_level: 'low' | 'medium' | 'high'
  reasoning: string
  key_factors: string[]
  timestamp: number
}

export interface PositionEntry {
  symbol: string
  entry_time: number
  entry_price: number
  entry_sentiment: number
  entry_social_volume: number
  entry_sources: string[]
  entry_reason: string
  peak_price: number
  peak_sentiment: number
}

export interface TwitterConfirmation {
  symbol: string
  query: string
  tweetCount: number
  sentiment: number
  bullishCount: number
  bearishCount: number
  influencerMentions: number
  averageEngagement: number
  timestamp: number
}

export interface PremarketPlan {
  timestamp: number
  summary: string
  recommendations: Array<{
    symbol: string
    action: 'BUY' | 'SELL' | 'HOLD' | 'SKIP'
    confidence: number
    reasoning: string
    entry_price?: number
    target_price?: number
    stop_loss?: number
  }>
  highConvictionPlays: string[]
  marketOutlook: string
}

export interface StalenessAnalysis {
  symbol: string
  score: number
  holdDays: number
  gainPct: number
  socialVolumeDecay: number
  shouldExit: boolean
  reasons: string[]
}

export interface OvernightActivity {
  signalsGathered: number
  signalsResearched: number
  buySignals: number
  twitterConfirmations: number
  premarketPlanReady: boolean
  lastUpdated: number
}

export interface PortfolioSnapshot {
  timestamp: number
  equity: number
  pl: number
  pl_pct: number
}

export interface PositionHistory {
  symbol: string
  prices: number[]
  timestamps: number[]
}

export interface Status {
  account: Account | null
  positions: Position[]
  clock: Clock | null
  config: Config
  signals: Signal[]
  logs: LogEntry[]
  costs: CostTracker
  lastAnalystRun: number
  lastResearchRun: number
  signalResearch: Record<string, SignalResearch>
  positionResearch: Record<string, PositionResearch>
  portfolioHistory?: PortfolioSnapshot[]
  positionHistory?: Record<string, PositionHistory>
  positionEntries?: Record<string, PositionEntry>
  twitterConfirmations?: Record<string, TwitterConfirmation>
  premarketPlan?: PremarketPlan | null
  stalenessAnalysis?: Record<string, StalenessAnalysis>
  overnightActivity?: OvernightActivity
}
