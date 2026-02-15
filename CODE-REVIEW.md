# Trading Agent Code Review: Top 3 High-Impact Changes

After reading every file in the codebase and validating with a second-pass analysis, here are the three changes with the highest expected impact on reliability, risk control, and decision quality.

---

## Change 1: Add Order Lifecycle Reconciliation

### What's broken

The agent treats "order submitted to Alpaca" as "position exists" — with no verification, no fill tracking, and immediate state mutation.

**Evidence chain:**

1. `PolicyBroker.buy()` (`src/core/policy-broker.ts:162-168`) fires a market order and returns `true` based on submission, not fill status. The Alpaca response includes `status` (could be `accepted`, `pending_new`, etc.) but it's never checked.

2. Immediately after `buy()` returns `true`, `positionEntries[symbol]` is created with **`entry_price: 0`** and **`peak_price: 0`** (`src/durable-objects/mahoraga-harness.ts:800-812`). These are never updated in the autonomous loop.

3. The **only** backfill of `entry_price` happens in `handleStatus()` (`src/durable-objects/mahoraga-harness.ts:1153-1158`) — which runs only when someone manually calls the `/status` HTTP endpoint:
   ```typescript
   if (entry && entry.entry_price === 0 && pos.avg_entry_price) {
     entry.entry_price = pos.avg_entry_price;
     entry.peak_price = Math.max(entry.peak_price, pos.current_price);
   }
   ```

4. `PolicyBroker.sell()` (`src/core/policy-broker.ts:217`) calls `closePosition()` and immediately triggers `onSell` which **deletes** `positionEntries[symbol]` — even though the close order may not be filled yet.

5. `analyzeStaleness()` (`src/strategy/default/rules/staleness.ts:31`) computes P&L as:
   ```typescript
   const pnlPct = entry.entry_price > 0 ? ((currentPrice - entry.entry_price) / entry.entry_price) * 100 : 0;
   ```
   When `entry_price === 0`, pnlPct is always 0. The price-action component of staleness scoring (up to 30 points) is dead.

6. **Bonus bug**: when `useOptions` is true (`src/durable-objects/mahoraga-harness.ts:786-795`), the agent calls `executeOptionsOrder()` AND then `ctx.broker.buy()` — placing both an options order and an equity buy for the same signal. Double exposure.

### What could go wrong today

- **Phantom positions**: agent thinks it owns AAPL because `buy()` returned `true`, but the order was rejected/cancelled by Alpaca. Next tick's policy checks see a position that doesn't exist.
- **Duplicate orders**: if an order is `accepted` but not yet reflected in `getPositions()`, the next alarm tick can submit another buy (30s cycle, positions cache is invalidated but Alpaca may not reflect the order yet).
- **Stale positions never exit**: `entry_price = 0` means staleness detection's price component scores 0/30 for every position, regardless of actual loss. A position down 20% looks the same as one up 5%.
- **Premature state deletion on sell**: closing order isn't guaranteed filled, but local state is already destroyed.

### Expected effect

Fewer phantom positions, no duplicate orders, accurate staleness scores, reliable exit decisions. This is foundational correctness — every other risk check depends on the agent's state matching broker reality.

### Implementation guidance

**A) Track pending orders** — new state in `AgentState`:

```typescript
// src/core/types.ts
interface PendingOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  notional?: number;
  submittedAt: number;
  reason: string;
}

// Add to AgentState:
pendingOrders: Record<string, PendingOrder>; // keyed by symbol
```

**B) Store orderId from buy/sell** — modify `PolicyBroker.buy()` to return the order ID (or a richer result), and don't create `positionEntries` on submission:

In `src/core/policy-broker.ts`, change `buy()` return type:

```typescript
// Instead of returning boolean, return order info or null
async function buy(symbol: string, notional: number, reason: string): Promise<{ orderId: string } | null> {
  // ... existing validation and policy checks ...
  const alpacaOrder = await alpaca.trading.createOrder({ ... });

  // Don't call onBuy yet — wait for reconciliation
  return { orderId: alpacaOrder.id };
}
```

Update the harness call sites (`src/durable-objects/mahoraga-harness.ts:795`, `:862`, `:1012`) to store in `pendingOrders` instead of immediately creating `positionEntries`.

**C) Add reconciliation to the alarm loop** — new method in the harness, called every tick:

```typescript
private async reconcileOrders(ctx: StrategyContext): Promise<void> {
  const pending = Object.values(this.state.pendingOrders);
  if (pending.length === 0) return;

  const alpaca = createAlpacaProviders(this.env);

  for (const po of pending) {
    const order = await alpaca.trading.getOrder(po.orderId);

    if (order.status === "filled") {
      if (po.side === "buy") {
        // NOW create positionEntries with real fill price
        this.state.positionEntries[po.symbol] = {
          symbol: po.symbol,
          entry_time: Date.now(),
          entry_price: order.filled_avg_price,
          // ... other fields from signal data stored in PendingOrder ...
          peak_price: order.filled_avg_price,
        };
      } else {
        // Sell filled — compute P&L here (see Change 2)
      }
      delete this.state.pendingOrders[po.symbol];
    } else if (["rejected", "canceled", "expired", "suspended"].includes(order.status)) {
      this.log("Reconciliation", "order_failed", { symbol: po.symbol, status: order.status });
      delete this.state.pendingOrders[po.symbol];
    }
    // else: still pending, check next tick
  }
}
```

**D) Also update peak_price every tick** — in the alarm loop, after fetching positions:

```typescript
for (const pos of positions) {
  const entry = this.state.positionEntries[pos.symbol];
  if (entry) {
    if (entry.entry_price === 0 && pos.avg_entry_price) {
      entry.entry_price = pos.avg_entry_price; // defensive backfill
    }
    entry.peak_price = Math.max(entry.peak_price, pos.current_price);
  }
}
```

**E) Fix the options double-order bug** — `src/durable-objects/mahoraga-harness.ts:786-795`, add `continue` after options order:

```typescript
if (entry.useOptions) {
  const contract = await findBestOptionsContract(ctx, entry.symbol, "bullish", account.equity);
  if (contract) {
    await this.executeOptionsOrder(contract, 1, account.equity);
  }
  continue; // Don't also place equity buy
}
```

### Validation plan

1. **Unit test**: mock Alpaca order responses with various statuses (`filled`, `rejected`, `pending_new`). Assert that `positionEntries` is only created on `filled`, and that `pendingOrders` is cleaned up on terminal states.
2. **Integration test**: verify that two rapid buy calls for the same symbol don't produce duplicate `positionEntries`.
3. **Paper trading**: enable on Alpaca paper account. Log every reconciliation cycle. After 24h, compare `positionEntries` keys vs `getPositions()` symbols — they should match exactly.
4. **Metric**: track `reconciliation_mismatches` count. Should be 0 in steady state.

---

## Change 2: Close the Daily Loss Tracking Loop

### What's broken

The PolicyEngine's daily loss limit — the single most important circuit breaker — is a placebo. It reads a counter that is never written to.

**Evidence chain:**

1. `PolicyEngine.checkDailyLossLimit()` (`src/policy/engine.ts:105-116`) blocks trades when `daily_loss_usd / equity >= max_daily_loss_pct` (default 2%).

2. `recordDailyLoss(db, lossUsd)` exists in `src/storage/d1/queries/risk-state.ts:58-64` — it increments `daily_loss_usd` in D1. **But grep confirms it is never called anywhere in the codebase.**

3. `setCooldown(db, cooldownUntil)` also exists (`src/storage/d1/queries/risk-state.ts:66-68`) and is **never called**.

4. The midnight cron (`src/jobs/cron.ts:121`) resets `daily_loss_usd` to 0 — but since nothing ever increments it, it's resetting 0 to 0.

5. The `onSell` callback (`src/durable-objects/mahoraga-harness.ts:152-155`) only cleans up local state — no P&L computation, no loss recording:
   ```typescript
   onSell: (symbol) => {
     delete self.state.positionEntries[symbol];
     delete self.state.socialHistory[symbol];
     delete self.state.stalenessAnalysis[symbol];
   },
   ```

6. The P&L data needed to compute the loss (`positionEntries[symbol]`) is deleted in that same callback — destroyed before it can be used.

### What could go wrong today

The agent can lose its entire account in a single session. If 5 consecutive trades each lose 3%, the daily drawdown is ~14% — but `daily_loss_usd` stays at 0 and the PolicyEngine approves trade #6. The 2% daily loss limit, the loss cooldown period, and the kill-switch-on-consecutive-losses pattern are all non-functional.

### Expected effect

Restores the daily loss circuit breaker. Prevents ruin scenarios. Enables cooldown periods after losses. This is the difference between "bad day" and "blown account."

### Implementation guidance

**A) Compute realized P&L on sell reconciliation** (ties into Change 1's reconciliation loop):

When a sell order is confirmed `filled`, compute P&L before deleting state:

```typescript
// In reconcileOrders(), sell-filled branch:
if (po.side === "sell") {
  const entry = this.state.positionEntries[po.symbol];
  if (entry && entry.entry_price > 0) {
    // Use filled price from order, or fall back to position data
    const exitPrice = order.filled_avg_price;
    const entryPrice = entry.entry_price;
    const filledQty = order.filled_qty;
    const realizedPL = (exitPrice - entryPrice) * filledQty;

    // Record loss to D1
    if (realizedPL < 0 && db) {
      await recordDailyLoss(db, Math.abs(realizedPL));

      // Optional: set cooldown after loss
      const cooldownMinutes = ctx.config.cooldown_minutes_after_loss ?? 15;
      const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
      await setCooldown(db, cooldownUntil);
    }
  }

  // NOW safe to clean up local state
  delete this.state.positionEntries[po.symbol];
  delete this.state.socialHistory[po.symbol];
  delete this.state.stalenessAnalysis[po.symbol];
}
```

**B) Conservative interim fix** (if Change 1's full reconciliation takes time):

Modify the `onSell` callback in `src/durable-objects/mahoraga-harness.ts:151-155` to compute an approximate P&L from current position data before deletion:

```typescript
onSell: async (symbol) => {
  // Compute P&L from position data before deleting
  const positions = await alpaca.trading.getPositions();
  const pos = positions.find(p => p.symbol === symbol);
  const entry = self.state.positionEntries[symbol];

  if (pos && pos.unrealized_pl < 0 && db) {
    await recordDailyLoss(db, Math.abs(pos.unrealized_pl));
    // Cooldown: block new buys for N minutes after a loss
    const cooldownMin = self.state.config.cooldown_minutes_after_loss ?? 15;
    await setCooldown(db, new Date(Date.now() + cooldownMin * 60_000).toISOString());
  }

  delete self.state.positionEntries[symbol];
  delete self.state.socialHistory[symbol];
  delete self.state.stalenessAnalysis[symbol];
},
```

Note: the `onSell` callback would need to become async, requiring a small refactor of the `PolicyBrokerDeps` type.

**C) Add `cooldown_minutes_after_loss` to agent config** (`src/schemas/agent-config.ts`):

```typescript
cooldown_minutes_after_loss: z.number().min(0).max(1440).default(15),
```

### Validation plan

1. **Unit test**: simulate a sell with negative P&L. Assert `recordDailyLoss` is called with correct amount, and `setCooldown` is called. Then simulate a buy attempt — assert PolicyEngine blocks it during cooldown.
2. **Integration test**: after 3 losing sells totaling > 2% of equity, assert the next buy is rejected by `checkDailyLossLimit`. After midnight reset, assert buys work again.
3. **Paper trading**: monitor D1 `risk_state` table. `daily_loss_usd` should be non-zero after any losing trade. At midnight, verify reset to 0. Track in logs how often `daily_loss_limit` violation fires.
4. **Metric**: dashboard should display `daily_loss_usd / equity` as a percentage, with visual warning at 1.5% and block at 2%.

---

## Change 3: Route Options Orders Through PolicyEngine

### What's broken

`executeOptionsOrder()` (`src/durable-objects/mahoraga-harness.ts:885-926`) calls `alpaca.trading.createOrder()` directly, bypassing the `PolicyBroker` and `PolicyEngine` entirely. The comprehensive options policy checks in `PolicyEngine.evaluateOptionsOrder()` (`src/policy/engine.ts:285-309`) — DTE range, delta range, strategy whitelist, total exposure cap, averaging-down guard, position count limit — are dead code for autonomous trading.

**Evidence chain:**

1. `executeOptionsOrder()` is called from `runAnalyst()` at `src/durable-objects/mahoraga-harness.ts:788-791`:
   ```typescript
   if (entry.useOptions) {
     const contract = await findBestOptionsContract(ctx, entry.symbol, "bullish", account.equity);
     if (contract) {
       await this.executeOptionsOrder(contract, 1, account.equity);
     }
   }
   ```

2. Inside `executeOptionsOrder()`, the only safety check is a single `options_max_pct_per_trade` size cap (`src/durable-objects/mahoraga-harness.ts:892-901`). It then calls Alpaca directly:
   ```typescript
   const alpaca = createAlpacaProviders(this.env);
   const order = await alpaca.trading.createOrder({
     symbol: contract.symbol,
     qty,
     side: "buy",
     type: "limit",
     limit_price: Math.round(contract.mid_price * 100) / 100,
     time_in_force: "day",
   });
   ```

3. `PolicyEngine.evaluateOptionsOrder()` (`src/policy/engine.ts:285-309`) runs 9 checks that are **never invoked** by autonomous trading:
   - Kill switch (`checkKillSwitch`)
   - Cooldown (`checkCooldown`)
   - Daily loss limit (`checkDailyLossLimit`)
   - Trading hours (`checkTradingHours`)
   - Options enabled (`checkOptionsEnabled`)
   - DTE range 30-60 days (`checkOptionsDTE`)
   - Delta range 0.30-0.70 (`checkOptionsDelta`)
   - Strategy whitelist long_call/long_put only (`checkOptionsStrategy`)
   - Position size % of equity (`checkOptionsPositionSize`)
   - Total options exposure cap 10% of equity (`checkOptionsTotalExposure`)
   - Max 3 options positions (`checkOptionsPositionCount`)
   - No averaging down on losers (`checkOptionsAveragingDown`)
   - Buying power check (`checkOptionsBuyingPower`)

4. `findBestOptionsContract()` (`src/strategy/default/rules/options.ts:23-134`) does some filtering (DTE range, delta range, spread <10%), but this is **selection heuristics**, not policy enforcement. It uses `config.options_*` fields, not the `PolicyConfig.options` values — these can diverge.

### What could go wrong today

- **Options trade during kill switch**: `executeOptionsOrder` doesn't check `riskState.kill_switch_active`. If kill switch is active, equity trades are blocked but options trades sail through.
- **Options trade during loss cooldown**: same bypass — no cooldown check.
- **Options trade past daily loss limit**: daily loss (once Change 2 is wired) won't gate options orders.
- **Exceeds total options exposure**: `PolicyEngine` caps total options exposure at 10% of equity. `executeOptionsOrder` has no equivalent check. With options enabled, the agent can pile into options until it runs out of cash.
- **Exceeds position count**: `PolicyEngine` limits to 3 options positions. `executeOptionsOrder` has no such check.
- **Averages down on losers**: `PolicyEngine` blocks adding to losing options positions. `executeOptionsOrder` doesn't check existing positions at all.
- **No position tracking**: options buys don't create `positionEntries`, so the agent has no local record of the options order. Staleness detection, P&L tracking, and the reconciliation loop (Change 1) are blind to options.

### Expected effect

All 13 options policy checks become active for autonomous trading. Kill switch, daily loss limits, exposure caps, and position count limits apply uniformly to all order types. Options orders participate in the same reconciliation and P&L tracking as equity orders.

### Implementation guidance

**A) Add `buyOption()` to the PolicyBroker** — `src/core/policy-broker.ts`:

This mirrors the existing `buy()` function but builds an `OptionsOrderPreview` and runs `PolicyEngine.evaluateOptionsOrder()`.

```typescript
// Add to PolicyBrokerDeps interface:
export interface PolicyBrokerDeps {
  // ... existing fields ...
  /** Called after a successful options buy order */
  onOptionsBuy?: (contractSymbol: string, underlying: string, qty: number) => void;
}

// Add to the broker object returned by createPolicyBroker():
async function buyOption(
  contract: {
    symbol: string;       // contract symbol e.g. "AAPL240315C00170000"
    underlying: string;   // e.g. "AAPL"
    strike: number;
    expiration: string;
    delta: number;
    mid_price: number;
    option_type: "call" | "put";
  },
  qty: number,
  reason: string
): Promise<{ orderId: string } | null> {
  if (qty < 1 || !Number.isFinite(qty)) {
    log("PolicyBroker", "options_buy_blocked", { symbol: contract.symbol, reason: "Invalid qty" });
    return null;
  }

  const today = new Date();
  const expDate = new Date(contract.expiration);
  const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const order: OptionsOrderPreview = {
    contract_symbol: contract.symbol,
    underlying: contract.underlying,
    side: "buy",
    qty,
    order_type: "limit",
    limit_price: Math.round(contract.mid_price * 100) / 100,
    time_in_force: "day",
    expiration: contract.expiration,
    strike: contract.strike,
    option_type: contract.option_type,
    dte,
    delta: contract.delta,
    estimated_premium: contract.mid_price,
    estimated_cost: contract.mid_price * qty * 100,
  };

  try {
    const [account, positions, clock, riskState] = await Promise.all([
      getAccount(),
      getPositions(),
      getClock(),
      getRiskStateOrDefault(),
    ]);

    const ctx: OptionsPolicyContext = { order, account, positions, clock, riskState };
    const result = engine.evaluateOptionsOrder(ctx);

    if (!result.allowed) {
      log("PolicyBroker", "options_buy_rejected", {
        symbol: contract.symbol,
        violations: result.violations.map((v) => v.message),
      });
      return null;
    }

    if (result.warnings.length > 0) {
      log("PolicyBroker", "options_buy_warnings", {
        symbol: contract.symbol,
        warnings: result.warnings.map((w) => w.message),
      });
    }

    const alpacaOrder = await alpaca.trading.createOrder({
      symbol: contract.symbol,
      qty,
      side: "buy",
      type: "limit",
      limit_price: Math.round(contract.mid_price * 100) / 100,
      time_in_force: "day",
    });

    log("PolicyBroker", "options_buy_executed", {
      contract: contract.symbol,
      qty,
      status: alpacaOrder.status,
      estimated_cost: (contract.mid_price * qty * 100).toFixed(2),
      reason,
    });

    cachedAccount = null;
    cachedPositions = null;

    return { orderId: alpacaOrder.id };
  } catch (error) {
    log("PolicyBroker", "options_buy_failed", { symbol: contract.symbol, error: String(error) });
    return null;
  }
}
```

**B) Update the StrategyContext broker interface** — `src/strategy/types.ts:53-61`:

Add `buyOption` to the broker contract so strategies can access it:

```typescript
broker: {
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getClock(): Promise<MarketClock>;
  buy(symbol: string, notional: number, reason: string): Promise<boolean>;
  sell(symbol: string, reason: string): Promise<boolean>;
  /** Execute an options buy through PolicyEngine. Returns order ID or null. */
  buyOption(contract: {
    symbol: string;
    underlying: string;
    strike: number;
    expiration: string;
    delta: number;
    mid_price: number;
    option_type: "call" | "put";
  }, qty: number, reason: string): Promise<{ orderId: string } | null>;
};
```

**C) Replace `executeOptionsOrder()` call site** — `src/durable-objects/mahoraga-harness.ts:786-795`:

The current `findBestOptionsContract()` returns `{ symbol, strike, expiration, delta, mid_price, max_contracts }`. It needs a minor addition to also return `option_type` (derivable from `direction` param). Then replace the direct call:

```typescript
if (entry.useOptions) {
  const contract = await findBestOptionsContract(ctx, entry.symbol, "bullish", account.equity);
  if (contract) {
    const result = await ctx.broker.buyOption(
      {
        symbol: contract.symbol,
        underlying: entry.symbol,
        strike: contract.strike,
        expiration: contract.expiration,
        delta: contract.delta,
        mid_price: contract.mid_price,
        option_type: "call", // "bullish" -> call; derive from direction
      },
      1,
      entry.reason
    );
    if (result) {
      // Track in pendingOrders for reconciliation (Change 1)
      this.state.pendingOrders[contract.symbol] = {
        orderId: result.orderId,
        symbol: contract.symbol,
        side: "buy",
        submittedAt: Date.now(),
        reason: entry.reason,
      };
    }
  }
  continue; // Don't also place equity buy (fixes double-order bug)
}
```

**D) Delete `executeOptionsOrder()` from harness** — `src/durable-objects/mahoraga-harness.ts:885-926`:

Once `buyOption` is wired through PolicyBroker, the private `executeOptionsOrder()` method is dead code and should be removed to prevent anyone from accidentally using the unguarded path.

**E) Add `option_type` to `OptionsContract` return** — `src/strategy/default/rules/options.ts:11-18`:

```typescript
export interface OptionsContract {
  symbol: string;
  strike: number;
  expiration: string;
  delta: number;
  mid_price: number;
  max_contracts: number;
  option_type: "call" | "put"; // add this
}
```

Update `findBestOptionsContract()` to set `option_type: direction === "bullish" ? "call" : "put"` in the return value at `src/strategy/default/rules/options.ts:119-126`.

### Validation plan

1. **Unit test**: build an `OptionsPolicyContext` with kill switch active. Assert `buyOption` returns `null`. Repeat for: daily loss exceeded, cooldown active, DTE out of range, delta out of range, max positions reached, averaging down on loser.
2. **Unit test**: verify `buyOption` succeeds when all policy checks pass. Assert the correct Alpaca `createOrder` params are passed through.
3. **Integration test**: enable options, trigger a kill switch, attempt an options buy. Assert it's blocked. Disable kill switch, assert it succeeds.
4. **Paper trading**: with options enabled, monitor logs for `options_buy_rejected` entries. Verify that `evaluateOptionsOrder` violations appear in logs (not just the old size-cap check). Confirm no `executeOptionsOrder` log entries remain (method deleted).
5. **Regression**: verify `findBestOptionsContract` still returns valid contracts — the selection heuristics are unchanged, only the execution path changes.

---

## Missing Information / Assumptions

| Missing | Assumed |
|---|---|
| Slippage/fees model | None modeled. Market orders on liquid names = ~5-15bps. Not critical for correctness but matters for P&L accuracy. |
| Alpaca order response shape (exact `status` values) | Standard Alpaca v2 API. `OrderStatus` type in `src/providers/types.ts:73-88` already enumerates all values. |
| `cooldown_minutes_after_loss` in `AgentConfig` | Doesn't exist yet. Needs to be added to the Zod schema in `src/schemas/agent-config.ts`. Already present in `PolicyConfig` (`src/policy/config.ts:37`). |
| `getOrder(id)` on Alpaca client | Already implemented. `AlpacaTradingProvider.getOrder()` exists at `src/providers/alpaca/trading.ts:206-208` and is declared on `BrokerProvider` at `src/providers/types.ts:209`. Ready to use. |
