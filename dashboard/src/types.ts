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
}

export interface CostTracker {
  total_usd: number
  calls: number
  tokens_in: number
  tokens_out: number
}

export interface Config {
  mcp_url: string
  data_poll_interval_ms: number
  analyst_interval_ms: number
  max_position_value: number
  max_positions: number
  min_sentiment_score: number
  min_analyst_confidence: number
  sell_sentiment_threshold: number
  take_profit_pct: number
  stop_loss_pct: number
  position_size_pct_of_cash: number
  llm_model: string
  llm_analyst_model?: string
  llm_max_tokens: number
  starting_equity?: number
  
  // Stale position management
  stale_position_enabled?: boolean
  stale_min_hold_hours?: number
  stale_max_hold_days?: number
  stale_min_gain_pct?: number
  stale_mid_hold_days?: number
  stale_mid_min_gain_pct?: number
  stale_social_volume_decay?: number
  stale_no_mentions_hours?: number
  
  // Options config
  options_enabled?: boolean
  options_min_confidence?: number
  options_max_pct_per_trade?: number
  options_max_total_exposure?: number
  options_min_dte?: number
  options_max_dte?: number
  options_target_delta?: number
  options_min_delta?: number
  options_max_delta?: number
  options_stop_loss_pct?: number
  options_take_profit_pct?: number
  options_max_positions?: number
  
  // Crypto trading config (24/7)
  crypto_enabled?: boolean
  crypto_symbols?: string[]
  crypto_momentum_threshold?: number
  crypto_max_position_value?: number
  crypto_take_profit_pct?: number
  crypto_stop_loss_pct?: number
}

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
