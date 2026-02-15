# Order Lifecycle & Risk Controls

## Problem

Three critical correctness gaps:

1. **No order fill verification** -- `buy()` returns `true` on submission, `positionEntries` created with `entry_price: 0`, never updated outside manual `/status` endpoint. Staleness P&L scoring dead when `entry_price === 0`.
2. **Daily loss limit is dead code** -- `PolicyEngine.checkDailyLossLimit()` reads `daily_loss_usd` but `recordDailyLoss()` is never called. Agent can lose entire account in one session.
3. **Options bypass all policy checks** -- `executeOptionsOrder()` calls Alpaca directly, skipping kill switch, cooldown, daily loss, exposure caps, position limits. Also: options + equity buy fired for same signal (double exposure).

## Scope

Derived from `CODE-REVIEW.md` changes 1-3. Each task is atomic and independently shippable (passes typecheck/lint/tests on its own).

## Implementation Status

### Change 1: Order Lifecycle Reconciliation

- [x] **Fix options double-order bug**
  Add `continue` after `executeOptionsOrder()` in `runAnalyst` options branch (`mahoraga-harness.ts:786-795`). Prevents equity buy firing for same signal.
  Files: `src/durable-objects/mahoraga-harness.ts`

- [x] **Update peak_price every tick**
  After fetching positions in alarm loop, update `positionEntries[symbol].peak_price` via `Math.max`. Also defensively backfill `entry_price` from `pos.avg_entry_price` when still 0. Also fixed status handler to use same improved logic.
  Files: `src/durable-objects/mahoraga-harness.ts`

- [x] **Add order lifecycle reconciliation**
  Added `PendingOrder` type + `TERMINAL_ORDER_STATUSES` to `core/types.ts`, `pendingOrders` to `AgentState`. Changed `PolicyBroker.buy()` to return `{ orderId: string } | null`. Updated `StrategyContext.broker.buy` signature. All 3 harness buy sites now store to `pendingOrders`. Added `reconcileOrders()` to alarm loop: polls `getOrder()`, creates `positionEntries` with real `filled_avg_price` on fill, cleans up terminal/stale orders.
  Files: `src/core/types.ts`, `src/core/policy-broker.ts`, `src/strategy/types.ts`, `src/durable-objects/mahoraga-harness.ts`, `src/strategy/default/config.ts`

### Change 2: Daily Loss Tracking

- [x] **Wire daily loss tracking on sell**
  Added `cooldown_minutes_after_loss` to `AgentConfigSchema` (default 15). Changed `PolicyBrokerDeps.onSell` to async with `closingPosition` param. `sell()` now snapshots position before close, passes to `onSell`. Harness callback reads `unrealized_pl`, calls `recordDailyLoss()`/`setCooldown()` on loss, then cleans up local state.
  Files: `src/schemas/agent-config.ts`, `src/core/policy-broker.ts`, `src/durable-objects/mahoraga-harness.ts`, `src/strategy/default/config.ts`

### Change 3: Options Policy Enforcement

- [ ] **Route options orders through PolicyEngine**
  - Add `option_type: "call" | "put"` to `OptionsContract` in `src/strategy/default/rules/options.ts`
  - Set `option_type` in `findBestOptionsContract()` return based on `direction` param
  - Add `buyOption()` to `PolicyBroker`: builds `OptionsOrderPreview`, runs `engine.evaluateOptionsOrder()`, creates order on approval
  - Add `buyOption` to `StrategyContext.broker` interface in `src/strategy/types.ts`
  - Replace `executeOptionsOrder()` call site with `ctx.broker.buyOption()` + `continue`
  - Delete `executeOptionsOrder()` method from harness (dead code)
  Files: `src/strategy/default/rules/options.ts`, `src/core/policy-broker.ts`, `src/strategy/types.ts`, `src/durable-objects/mahoraga-harness.ts`

### Integration (blocked by earlier tasks)

- [ ] **Track options in reconciliation** `[blocked by: "Add order lifecycle reconciliation" + "Route options through PolicyEngine"]`
  Store options buys in `pendingOrders` from `buyOption()` result. Reconciliation loop handles options fills identically to equity.
  Files: `src/durable-objects/mahoraga-harness.ts`

- [ ] **Move P&L computation to reconciliation loop** `[blocked by: "Add order lifecycle reconciliation" + "Wire daily loss tracking on sell"]`
  Compute realized P&L in `reconcileOrders()` sell-filled branch using `filled_avg_price`. Call `recordDailyLoss()`/`setCooldown()` there. Simplify `onSell` to just clean up local state.
  Files: `src/durable-objects/mahoraga-harness.ts`

## Dependency Graph

```
fix-double-order -----> (done, superseded by options-routing)
peak-price-update ----> (standalone)
reconciliation -------> track-options-in-reconciliation
                    \-> move-pnl-to-reconciliation
daily-loss-wiring ----> move-pnl-to-reconciliation
options-routing ------> track-options-in-reconciliation
```

## Assumptions

- Alpaca v2 API; `OrderStatus` enum in `src/providers/types.ts:73-88` covers all states
- `AlpacaTradingProvider.getOrder()` exists at `src/providers/alpaca/trading.ts:206-208`
- No slippage/fees model; market orders on liquid names ~5-15bps
- `PolicyConfig.options` values are source of truth for policy checks (not `AgentConfig.options_*`)
