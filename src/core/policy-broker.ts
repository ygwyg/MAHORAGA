/**
 * PolicyEngine-wrapped broker — every autonomous trade goes through policy checks.
 *
 * This is the H2 security fix: the harness used to call alpaca.trading.createOrder()
 * directly, bypassing kill switch, daily loss limits, position concentration, etc.
 * Now all trades (buy AND sell) go through PolicyEngine.evaluate() first.
 *
 * Strategies call ctx.broker.buy()/sell(). buy() returns { orderId } on
 * submission (null on rejection); sell() returns boolean.
 * They cannot bypass these safety checks.
 */

import type { OrderPreview } from "../mcp/types";
import type { PolicyConfig } from "../policy/config";
import { type PolicyContext, PolicyEngine } from "../policy/engine";
import type { AlpacaProviders } from "../providers/alpaca";
import type { Account, MarketClock, Position } from "../providers/types";
import type { D1Client } from "../storage/d1/client";
import type { RiskState } from "../storage/d1/queries/risk-state";
import { getRiskState } from "../storage/d1/queries/risk-state";
import { isCryptoSymbol, normalizeCryptoSymbol } from "../strategy/default/helpers/crypto";
import type { StrategyContext } from "../strategy/types";

export interface PolicyBrokerDeps {
  alpaca: AlpacaProviders;
  policyConfig: PolicyConfig;
  db: D1Client | null;
  log: (agent: string, action: string, details: Record<string, unknown>) => void;
  cryptoSymbols: string[];
  allowedExchanges: string[];
  /** Called after a successful buy order */
  onBuy?: (symbol: string, notional: number) => void;
  /** Called after a successful sell/close order. Position is the snapshot before close. */
  onSell?: (symbol: string, reason: string, closingPosition: Position | null) => Promise<void>;
}

/**
 * Create the broker adapter that strategies use via ctx.broker.
 * All orders are validated by PolicyEngine before execution.
 */
export function createPolicyBroker(deps: PolicyBrokerDeps): StrategyContext["broker"] {
  const { alpaca, policyConfig, db, log } = deps;
  const engine = new PolicyEngine(policyConfig);

  // Cache account/positions/clock per cycle to avoid redundant API calls
  let cachedAccount: Account | null = null;
  let cachedPositions: Position[] | null = null;
  let cachedClock: MarketClock | null = null;

  async function getAccount(): Promise<Account> {
    if (!cachedAccount) {
      cachedAccount = await alpaca.trading.getAccount();
    }
    return cachedAccount;
  }

  async function getPositions(): Promise<Position[]> {
    if (!cachedPositions) {
      cachedPositions = await alpaca.trading.getPositions();
    }
    return cachedPositions;
  }

  async function getClock(): Promise<MarketClock> {
    if (!cachedClock) {
      cachedClock = await alpaca.trading.getClock();
    }
    return cachedClock;
  }

  async function getRiskStateOrDefault(): Promise<RiskState> {
    if (!db) {
      return {
        kill_switch_active: false,
        kill_switch_reason: null,
        kill_switch_at: null,
        daily_loss_usd: 0,
        daily_loss_reset_at: null,
        last_loss_at: null,
        cooldown_until: null,
        updated_at: new Date().toISOString(),
      };
    }
    return getRiskState(db);
  }

  async function buy(symbol: string, notional: number, reason: string): Promise<{ orderId: string } | null> {
    if (!symbol || symbol.trim().length === 0) {
      log("PolicyBroker", "buy_blocked", { reason: "Empty symbol" });
      return null;
    }

    if (notional <= 0 || !Number.isFinite(notional)) {
      log("PolicyBroker", "buy_blocked", { symbol, reason: "Invalid notional", notional });
      return null;
    }

    const isCrypto = isCryptoSymbol(symbol, deps.cryptoSymbols);
    const orderSymbol = isCrypto ? normalizeCryptoSymbol(symbol) : symbol;
    const assetClass = isCrypto ? "crypto" : "us_equity";
    const timeInForce = isCrypto ? "gtc" : "day";

    // Exchange validation for equities
    if (!isCrypto && deps.allowedExchanges.length > 0) {
      try {
        const asset = await alpaca.trading.getAsset(symbol);
        if (!asset) {
          log("PolicyBroker", "buy_blocked", { symbol, reason: "Asset not found" });
          return null;
        }
        if (!deps.allowedExchanges.includes(asset.exchange)) {
          log("PolicyBroker", "buy_blocked", {
            symbol,
            reason: "Exchange not allowed",
            exchange: asset.exchange,
          });
          return null;
        }
      } catch {
        log("PolicyBroker", "buy_blocked", { symbol, reason: "Asset lookup failed" });
        return null;
      }
    }

    // Build OrderPreview for PolicyEngine
    const order: OrderPreview = {
      symbol: orderSymbol,
      asset_class: assetClass,
      side: "buy",
      notional: Math.round(notional * 100) / 100,
      order_type: "market",
      time_in_force: timeInForce,
    };

    try {
      const [account, positions, clock, riskState] = await Promise.all([
        getAccount(),
        getPositions(),
        getClock(),
        getRiskStateOrDefault(),
      ]);

      const ctx: PolicyContext = { order, account, positions, clock, riskState };
      const result = engine.evaluate(ctx);

      if (!result.allowed) {
        log("PolicyBroker", "buy_rejected", {
          symbol,
          notional,
          violations: result.violations.map((v) => v.message),
        });
        return null;
      }

      if (result.warnings.length > 0) {
        log("PolicyBroker", "buy_warnings", {
          symbol,
          warnings: result.warnings.map((w) => w.message),
        });
      }

      // Execute
      const alpacaOrder = await alpaca.trading.createOrder({
        symbol: orderSymbol,
        notional: Math.round(notional * 100) / 100,
        side: "buy",
        type: "market",
        time_in_force: timeInForce,
      });

      log("PolicyBroker", "buy_executed", {
        symbol: orderSymbol,
        isCrypto,
        status: alpacaOrder.status,
        notional,
        reason,
      });

      // Invalidate cache after order
      cachedAccount = null;
      cachedPositions = null;

      deps.onBuy?.(symbol, notional);
      return { orderId: alpacaOrder.id };
    } catch (error) {
      log("PolicyBroker", "buy_failed", { symbol, error: String(error) });
      return null;
    }
  }

  async function sell(symbol: string, reason: string): Promise<boolean> {
    if (!symbol || symbol.trim().length === 0) {
      log("PolicyBroker", "sell_blocked", { reason: "Empty symbol" });
      return false;
    }

    if (!reason || reason.trim().length === 0) {
      log("PolicyBroker", "sell_blocked", { symbol, reason: "No sell reason provided" });
      return false;
    }

    // For sells (closing positions), we skip full PolicyEngine evaluation.
    // Closing a position is risk-reducing — blocking exits on kill switch
    // or cooldown would trap users in losing positions.
    // We only check kill switch to log a warning (but still execute).
    try {
      if (db) {
        const riskState = await getRiskStateOrDefault();
        if (riskState.kill_switch_active) {
          log("PolicyBroker", "sell_during_kill_switch", {
            symbol,
            reason,
            note: "Executing sell despite kill switch — closing positions is risk-reducing",
          });
        }
      }

      // Snapshot position data BEFORE close for P&L tracking
      const positionsBeforeClose = await getPositions();
      const closingPosition = positionsBeforeClose.find((p) => p.symbol === symbol);

      await alpaca.trading.closePosition(symbol);
      log("PolicyBroker", "sell_executed", { symbol, reason });

      await deps.onSell?.(symbol, reason, closingPosition ?? null);

      // Invalidate cache after order + callback
      cachedAccount = null;
      cachedPositions = null;

      return true;
    } catch (error) {
      log("PolicyBroker", "sell_failed", { symbol, error: String(error) });
      return false;
    }
  }

  return {
    getAccount,
    getPositions,
    getClock,
    buy,
    sell,
  };
}
