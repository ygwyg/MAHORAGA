import type { ToolError } from "../lib/errors";

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ToolError;
}

export function success<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function failure(error: ToolError): ToolResult<never> {
  return { ok: false, error };
}

export interface PolicyViolation {
  rule: string;
  message: string;
  current_value: unknown;
  limit_value: unknown;
}

export interface PolicyWarning {
  rule: string;
  message: string;
}

export interface PolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
  approval_token?: string;
  approval_id?: string;
  expires_at?: string;
}

export interface OrderPreview {
  symbol: string;
  asset_class: "us_equity" | "crypto";
  side: "buy" | "sell";
  qty?: number;
  notional?: number;
  order_type: "market" | "limit" | "stop" | "stop_limit";
  limit_price?: number;
  stop_price?: number;
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  estimated_price?: number;
  estimated_cost?: number;
  buying_power_impact?: number;
}

export interface OptionsOrderPreview {
  contract_symbol: string;
  underlying: string;
  side: "buy" | "sell";
  qty: number;
  order_type: "market" | "limit";
  limit_price?: number;
  time_in_force: "day" | "gtc";
  expiration: string;
  strike: number;
  option_type: "call" | "put";
  dte: number;
  delta?: number;
  estimated_premium?: number;
  estimated_cost?: number;
  buying_power_impact?: number;
}

export interface OptionsPolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
  approval_token?: string;
  approval_id?: string;
  expires_at?: string;
}

export type EventType =
  | "earnings_guidance_cut"
  | "earnings_beat"
  | "earnings_miss"
  | "merger"
  | "acquisition"
  | "lawsuit"
  | "sec_filing"
  | "insider_buy"
  | "insider_sell"
  | "analyst_upgrade"
  | "analyst_downgrade"
  | "product_launch"
  | "macro"
  | "rumor"
  | "social_momentum";


