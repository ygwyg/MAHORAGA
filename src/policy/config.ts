import { parseNumber } from "../lib/utils";
import type { Env } from "../env.d";

export type OptionsStrategy = "long_call" | "long_put";

export interface OptionsPolicyConfig {
  /** Enable options trading (default: false) */
  options_enabled: boolean;
  /** Maximum % of account per single options trade (default: 2%) */
  max_pct_per_option_trade: number;
  /** Maximum total options exposure as % of equity (default: 10%) */
  max_total_options_exposure_pct: number;
  /** Minimum days to expiration (default: 30 - no weeklies) */
  min_dte: number;
  /** Maximum days to expiration (default: 60) */
  max_dte: number;
  /** Minimum delta for option selection (default: 0.30) */
  min_delta: number;
  /** Maximum delta for option selection (default: 0.70) */
  max_delta: number;
  /** Allowed strategies (default: long_call, long_put only) */
  allowed_strategies: OptionsStrategy[];
  /** Never average down on losing options (default: true) */
  no_averaging_down: boolean;
  /** Maximum number of option positions (default: 3) */
  max_option_positions: number;
  /** Minimum confidence to trade options (default: 0.8) */
  min_confidence_for_options: number;
}

export interface PolicyConfig {
  max_position_pct_equity: number;
  max_open_positions: number;
  max_notional_per_trade: number;
  allowed_order_types: string[];
  max_daily_loss_pct: number;
  cooldown_minutes_after_loss: number;
  allowed_symbols: string[] | null;
  deny_symbols: string[];
  min_avg_volume: number;
  min_price: number;
  trading_hours_only: boolean;
  extended_hours_allowed: boolean;
  approval_token_ttl_seconds: number;
  allow_short_selling: boolean;
  use_cash_only: boolean;
  /** Options-specific policy configuration */
  options: OptionsPolicyConfig;
}

export function getDefaultOptionsPolicyConfig(): OptionsPolicyConfig {
  return {
    options_enabled: false,
    max_pct_per_option_trade: 0.02,
    max_total_options_exposure_pct: 0.10,
    min_dte: 30,
    max_dte: 60,
    min_delta: 0.30,
    max_delta: 0.70,
    allowed_strategies: ["long_call", "long_put"],
    no_averaging_down: true,
    max_option_positions: 3,
    min_confidence_for_options: 0.80,
  };
}

export function getDefaultPolicyConfig(env: Env): PolicyConfig {
  return {
    max_position_pct_equity: parseNumber(env.DEFAULT_MAX_POSITION_PCT, 0.1),
    max_open_positions: parseNumber(env.DEFAULT_MAX_OPEN_POSITIONS, 10),
    max_notional_per_trade: parseNumber(env.DEFAULT_MAX_NOTIONAL_PER_TRADE, 5000),
    allowed_order_types: ["market", "limit", "stop", "stop_limit"],
    max_daily_loss_pct: parseNumber(env.DEFAULT_MAX_DAILY_LOSS_PCT, 0.02),
    cooldown_minutes_after_loss: parseNumber(env.DEFAULT_COOLDOWN_MINUTES, 30),
    allowed_symbols: null,
    deny_symbols: [],
    min_avg_volume: 100000,
    min_price: 1.0,
    trading_hours_only: true,
    extended_hours_allowed: false,
    approval_token_ttl_seconds: parseNumber(env.DEFAULT_APPROVAL_TTL_SECONDS, 300),
    allow_short_selling: false,
    use_cash_only: true,
    options: getDefaultOptionsPolicyConfig(),
  };
}


