export interface Account {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: number;
  buying_power: number;
  regt_buying_power: number;
  daytrading_buying_power: number;
  equity: number;
  last_equity: number;
  long_market_value: number;
  short_market_value: number;
  portfolio_value: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  maintenance_margin: number;
  initial_margin: number;
  daytrade_count: number;
  created_at: string;
}

export interface Position {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: number;
  qty: number;
  side: "long" | "short";
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  unrealized_intraday_pl: number;
  unrealized_intraday_plpc: number;
  current_price: number;
  lastday_price: number;
  change_today: number;
}

export interface Order {
  id: string;
  client_order_id: string;
  symbol: string;
  asset_id: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  order_type: string;
  type: string;
  side: "buy" | "sell";
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  status: OrderStatus;
  extended_hours: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
}

export type OrderStatus =
  | "new"
  | "partially_filled"
  | "filled"
  | "done_for_day"
  | "canceled"
  | "expired"
  | "replaced"
  | "pending_cancel"
  | "pending_replace"
  | "pending_new"
  | "accepted"
  | "stopped"
  | "rejected"
  | "suspended"
  | "calculated";

export interface OrderParams {
  symbol: string;
  qty?: number;
  notional?: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
  trail_price?: number;
  trail_percent?: number;
  extended_hours?: boolean;
  client_order_id?: string;
}

export interface ListOrdersParams {
  status?: "open" | "closed" | "all";
  limit?: number;
  after?: string;
  until?: string;
  direction?: "asc" | "desc";
  nested?: boolean;
  symbols?: string[];
}

export interface MarketClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface MarketDay {
  date: string;
  open: string;
  close: string;
  settlement_date: string;
}

export interface Asset {
  id: string;
  class: "us_equity" | "crypto";
  exchange: string;
  symbol: string;
  name: string;
  status: "active" | "inactive";
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  fractionable: boolean;
}

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
}

export interface Quote {
  symbol: string;
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  timestamp: string;
}

export interface Snapshot {
  symbol: string;
  latest_trade: {
    price: number;
    size: number;
    timestamp: string;
  };
  latest_quote: Quote;
  minute_bar: Bar;
  daily_bar: Bar;
  prev_daily_bar: Bar;
}

export interface BarsParams {
  start?: string;
  end?: string;
  limit?: number;
  adjustment?: "raw" | "split" | "dividend" | "all";
  feed?: "iex" | "sip";
}

export interface BrokerProvider {
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | null>;
  closePosition(symbol: string, qty?: number, percentage?: number): Promise<Order>;

  createOrder(params: OrderParams): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  listOrders(params?: ListOrdersParams): Promise<Order[]>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(): Promise<void>;

  getClock(): Promise<MarketClock>;
  getCalendar(start: string, end: string): Promise<MarketDay[]>;
  
  getAsset(symbol: string): Promise<Asset | null>;
}

export interface MarketDataProvider {
  getBars(symbol: string, timeframe: string, params?: BarsParams): Promise<Bar[]>;
  getLatestBar(symbol: string): Promise<Bar>;
  getLatestBars(symbols: string[]): Promise<Record<string, Bar>>;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Record<string, Quote>>;
  getSnapshot(symbol: string): Promise<Snapshot>;
  getSnapshots(symbols: string[]): Promise<Record<string, Snapshot>>;
  getCryptoSnapshot(symbol: string): Promise<Snapshot>;
}

export interface OptionsChain {
  symbol: string;
  expiration: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  type: "call" | "put";
  open_interest: number;
  volume: number;
}

export interface OptionSnapshot {
  symbol: string;
  latest_quote: {
    bid_price: number;
    bid_size: number;
    ask_price: number;
    ask_size: number;
  };
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  implied_volatility?: number;
}

export interface OptionsProvider {
  isConfigured(): boolean;
  getExpirations(underlying: string): Promise<string[]>;
  getChain(underlying: string, expiration: string): Promise<OptionsChain>;
  getSnapshot(contractSymbol: string): Promise<OptionSnapshot>;
  getSnapshots(contractSymbols: string[]): Promise<Record<string, OptionSnapshot>>;
}

export interface NewsItem {
  id: string;
  source: string;
  headline: string;
  summary?: string;
  url?: string;
  symbols: string[];
  created_at: string;
}

export interface RawEvent {
  source: string;
  source_id: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface NewsProvider {
  poll(): Promise<RawEvent[]>;
  getLatest(symbol?: string, limit?: number): Promise<NewsItem[]>;
  search(query: string, limit?: number): Promise<NewsItem[]>;
}

import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";

export interface CompletionParams {
  model?: string;
  messages: ChatCompletionCreateParams["messages"];
  temperature?: number;
  max_tokens?: number;
  response_format?: ChatCompletionCreateParams["response_format"];
}

export interface CompletionResult {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMProvider {
  complete(params: CompletionParams): Promise<CompletionResult>;
}
