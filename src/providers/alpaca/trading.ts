import type { AlpacaClient } from "./client";
import type {
  Account,
  Position,
  Order,
  OrderParams,
  ListOrdersParams,
  MarketClock,
  MarketDay,
  Asset,
  BrokerProvider,
} from "../types";

interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  maintenance_margin: string;
  initial_margin: string;
  daytrade_count: number;
  created_at: string;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

interface AlpacaCalendarDay {
  date: string;
  open: string;
  close: string;
  settlement_date: string;
}

function parseAccount(raw: AlpacaAccount): Account {
  return {
    id: raw.id,
    account_number: raw.account_number,
    status: raw.status,
    currency: raw.currency,
    cash: parseFloat(raw.cash),
    buying_power: parseFloat(raw.buying_power),
    regt_buying_power: parseFloat(raw.regt_buying_power),
    daytrading_buying_power: parseFloat(raw.daytrading_buying_power),
    equity: parseFloat(raw.equity),
    last_equity: parseFloat(raw.last_equity),
    long_market_value: parseFloat(raw.long_market_value),
    short_market_value: parseFloat(raw.short_market_value),
    portfolio_value: parseFloat(raw.portfolio_value),
    pattern_day_trader: raw.pattern_day_trader,
    trading_blocked: raw.trading_blocked,
    transfers_blocked: raw.transfers_blocked,
    account_blocked: raw.account_blocked,
    multiplier: raw.multiplier,
    shorting_enabled: raw.shorting_enabled,
    maintenance_margin: parseFloat(raw.maintenance_margin),
    initial_margin: parseFloat(raw.initial_margin),
    daytrade_count: raw.daytrade_count,
    created_at: raw.created_at,
  };
}

function parsePosition(raw: AlpacaPosition): Position {
  return {
    asset_id: raw.asset_id,
    symbol: raw.symbol,
    exchange: raw.exchange,
    asset_class: raw.asset_class,
    avg_entry_price: parseFloat(raw.avg_entry_price),
    qty: parseFloat(raw.qty),
    side: raw.side as "long" | "short",
    market_value: parseFloat(raw.market_value),
    cost_basis: parseFloat(raw.cost_basis),
    unrealized_pl: parseFloat(raw.unrealized_pl),
    unrealized_plpc: parseFloat(raw.unrealized_plpc),
    unrealized_intraday_pl: parseFloat(raw.unrealized_intraday_pl),
    unrealized_intraday_plpc: parseFloat(raw.unrealized_intraday_plpc),
    current_price: parseFloat(raw.current_price),
    lastday_price: parseFloat(raw.lastday_price),
    change_today: parseFloat(raw.change_today),
  };
}

export class AlpacaTradingProvider implements BrokerProvider {
  constructor(private client: AlpacaClient) {}

  async getAccount(): Promise<Account> {
    const raw = await this.client.tradingRequest<AlpacaAccount>("GET", "/v2/account");
    return parseAccount(raw);
  }

  async getPositions(): Promise<Position[]> {
    const raw = await this.client.tradingRequest<AlpacaPosition[]>("GET", "/v2/positions");
    return raw.map(parsePosition);
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const raw = await this.client.tradingRequest<AlpacaPosition>(
        "GET",
        `/v2/positions/${encodeURIComponent(symbol)}`
      );
      return parsePosition(raw);
    } catch (error) {
      if ((error as { code?: string }).code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }

  async closePosition(
    symbol: string,
    qty?: number,
    percentage?: number
  ): Promise<Order> {
    let path = `/v2/positions/${encodeURIComponent(symbol)}`;
    const params = new URLSearchParams();

    if (qty !== undefined) {
      params.set("qty", String(qty));
    } else if (percentage !== undefined) {
      params.set("percentage", String(percentage));
    }

    const queryString = params.toString();
    if (queryString) {
      path += `?${queryString}`;
    }

    return this.client.tradingRequest<Order>("DELETE", path);
  }

  async createOrder(params: OrderParams): Promise<Order> {
    const body: Record<string, string | boolean> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      time_in_force: params.time_in_force,
    };

    if (params.qty !== undefined) {
      body.qty = String(params.qty);
    }
    if (params.notional !== undefined) {
      body.notional = String(params.notional);
    }
    if (params.limit_price !== undefined) {
      body.limit_price = String(params.limit_price);
    }
    if (params.stop_price !== undefined) {
      body.stop_price = String(params.stop_price);
    }
    if (params.trail_price !== undefined) {
      body.trail_price = String(params.trail_price);
    }
    if (params.trail_percent !== undefined) {
      body.trail_percent = String(params.trail_percent);
    }
    if (params.extended_hours !== undefined) {
      body.extended_hours = params.extended_hours;
    }
    if (params.client_order_id !== undefined) {
      body.client_order_id = params.client_order_id;
    }

    return this.client.tradingRequest<Order>("POST", "/v2/orders", body);
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.client.tradingRequest<Order>(
      "GET",
      `/v2/orders/${encodeURIComponent(orderId)}`
    );
  }

  async listOrders(params?: ListOrdersParams): Promise<Order[]> {
    let path = "/v2/orders";

    if (params) {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set("status", params.status);
      if (params.limit) searchParams.set("limit", String(params.limit));
      if (params.after) searchParams.set("after", params.after);
      if (params.until) searchParams.set("until", params.until);
      if (params.direction) searchParams.set("direction", params.direction);
      if (params.nested !== undefined) searchParams.set("nested", String(params.nested));
      if (params.symbols?.length) searchParams.set("symbols", params.symbols.join(","));

      const queryString = searchParams.toString();
      if (queryString) {
        path += `?${queryString}`;
      }
    }

    return this.client.tradingRequest<Order[]>("GET", path);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.client.tradingRequest<void>(
      "DELETE",
      `/v2/orders/${encodeURIComponent(orderId)}`
    );
  }

  async cancelAllOrders(): Promise<void> {
    await this.client.tradingRequest<void>("DELETE", "/v2/orders");
  }

  async getClock(): Promise<MarketClock> {
    const raw = await this.client.tradingRequest<AlpacaClock>("GET", "/v2/clock");
    return {
      timestamp: raw.timestamp,
      is_open: raw.is_open,
      next_open: raw.next_open,
      next_close: raw.next_close,
    };
  }

  async getCalendar(start: string, end: string): Promise<MarketDay[]> {
    const raw = await this.client.tradingRequest<AlpacaCalendarDay[]>(
      "GET",
      `/v2/calendar?start=${start}&end=${end}`
    );
    return raw.map((day) => ({
      date: day.date,
      open: day.open,
      close: day.close,
      settlement_date: day.settlement_date,
    }));
  }

  async getAsset(symbol: string): Promise<Asset | null> {
    try {
      const raw = await this.client.tradingRequest<Asset>(
        "GET",
        `/v2/assets/${encodeURIComponent(symbol)}`
      );
      return raw;
    } catch (error) {
      if ((error as { code?: string }).code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }
}

export function createAlpacaTradingProvider(client: AlpacaClient): AlpacaTradingProvider {
  return new AlpacaTradingProvider(client);
}
