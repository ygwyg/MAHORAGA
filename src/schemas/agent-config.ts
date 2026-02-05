import { z } from "zod";

export const AgentConfigSchema = z
  .object({
    // Polling intervals - how often the agent checks for new data
    data_poll_interval_ms: z.number().min(5000).max(300000), // [TUNE] Default: 30s. Lower = more API calls
    analyst_interval_ms: z.number().min(30000).max(600000), // [TUNE] Default: 120s. How often to run trading logic

    // Position limits - risk management basics
    max_position_value: z.number().positive().max(100000), // [TUNE] Max $ per position
    max_positions: z.number().int().min(1).max(50), // [TUNE] Max concurrent positions
    min_sentiment_score: z.number().min(0).max(1), // [TUNE] Min sentiment to consider buying (0-1)
    min_analyst_confidence: z.number().min(0).max(1), // [TUNE] Min LLM confidence to execute (0-1)

    // Risk management - take profit and stop loss
    take_profit_pct: z.number().min(1).max(100), // [TUNE] Take profit at this % gain
    stop_loss_pct: z.number().min(1).max(50), // [TUNE] Stop loss at this % loss
    position_size_pct_of_cash: z.number().min(1).max(100), // [TUNE] % of cash per trade

    // Stale position management - exit positions that have lost momentum
    stale_position_enabled: z.boolean(),
    stale_min_hold_hours: z.number().min(0).max(168), // [TUNE] Min hours before checking staleness
    stale_max_hold_days: z.number().min(1).max(30), // [TUNE] Force exit after this many days
    stale_min_gain_pct: z.number().min(0).max(100), // [TUNE] Required gain % to hold past max days
    stale_mid_hold_days: z.number().min(1).max(30),
    stale_mid_min_gain_pct: z.number().min(0).max(100),
    stale_social_volume_decay: z.number().min(0).max(1), // [TUNE] Exit if volume drops to this % of entry

    // LLM configuration
    llm_provider: z.enum(["openai-raw", "ai-sdk", "cloudflare-gateway"]), // [TUNE] Provider: openai-raw, ai-sdk, cloudflare-gateway
    llm_model: z.string().min(1), // [TUNE] Model for quick research (gpt-4o-mini)
    llm_analyst_model: z.string().min(1), // [TUNE] Model for deep analysis (gpt-4o)
    llm_min_hold_minutes: z.number().int().min(0).max(1440), // [TUNE] Min minutes before LLM can recommend sell (default: 30)

    // Options trading - trade options instead of shares for high-conviction plays
    options_enabled: z.boolean(), // [TOGGLE] Enable/disable options trading
    options_min_confidence: z.number().min(0).max(1), // [TUNE] Higher threshold for options (riskier)
    options_max_pct_per_trade: z.number().min(0).max(0.25),
    options_min_dte: z.number().int().min(1).max(365), // [TUNE] Minimum days to expiration
    options_max_dte: z.number().int().min(1).max(365), // [TUNE] Maximum days to expiration
    options_target_delta: z.number().min(0.1).max(0.9), // [TUNE] Target delta (0.3-0.5 typical)
    options_min_delta: z.number().min(0.1).max(0.9),
    options_max_delta: z.number().min(0.1).max(0.9),
    options_stop_loss_pct: z.number().min(1).max(100), // [TUNE] Options stop loss (wider than stocks)
    options_take_profit_pct: z.number().min(1).max(500), // [TUNE] Options take profit (higher targets)

    // Crypto trading - 24/7 momentum-based crypto trading
    crypto_enabled: z.boolean(), // [TOGGLE] Enable/disable crypto trading
    crypto_symbols: z.array(z.string()), // [TUNE] Which cryptos to trade (BTC/USD, etc.)
    crypto_momentum_threshold: z.number().min(0.1).max(20), // [TUNE] Min % move to trigger signal
    crypto_max_position_value: z.number().positive().max(100000),
    crypto_take_profit_pct: z.number().min(1).max(100),
    crypto_stop_loss_pct: z.number().min(1).max(50),

    // Custom ticker blacklist - user-defined symbols to never trade (e.g., insider trading restrictions)
    ticker_blacklist: z.array(z.string()),

    // Allowed exchanges - only trade stocks listed on these exchanges (avoids OTC data issues)
    allowed_exchanges: z.array(z.string()),

    // Dashboard - for P&L calculation
    starting_equity: z.number().positive(),
  })
  .refine((data) => data.options_min_delta < data.options_max_delta, {
    message: "options_min_delta must be less than options_max_delta",
    path: ["options_min_delta"],
  })
  .refine((data) => data.options_min_dte < data.options_max_dte, {
    message: "options_min_dte must be less than options_max_dte",
    path: ["options_min_dte"],
  })
  .refine((data) => data.stale_mid_hold_days <= data.stale_max_hold_days, {
    message: "stale_mid_hold_days must be <= stale_max_hold_days",
    path: ["stale_mid_hold_days"],
  });

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function validateAgentConfig(config: unknown): AgentConfig {
  return AgentConfigSchema.parse(config);
}

export function safeValidateAgentConfig(
  config: unknown
): { success: true; data: AgentConfig } | { success: false; error: z.ZodError } {
  const result = AgentConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
