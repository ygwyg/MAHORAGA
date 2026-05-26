/**
 * Exit rules — decide which positions to sell.
 *
 * Core ALWAYS enforces stop-loss/take-profit on top of strategy exits.
 * This function handles: TP, SL, staleness, and options exits.
 */

import type { Account, Position } from "../../../core/types";
import type { SellCandidate, StrategyContext } from "../../types";
import { analyzeStaleness } from "./staleness";

/**
 * Evaluate all positions and return sell candidates.
 * Core handles the actual order execution.
 */
export function selectExits(ctx: StrategyContext, positions: Position[], _account: Account): SellCandidate[] {
  const exits: SellCandidate[] = [];

  for (const pos of positions) {
    // Options are handled separately
    if (pos.asset_class === "us_option") {
      const optionExit = checkOptionsExit(pos, ctx);
      if (optionExit) exits.push(optionExit);
      continue;
    }

    const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100;

    // Take profit
    if (plPct >= ctx.config.take_profit_pct) {
      exits.push({
        symbol: pos.symbol,
        reason: `Take profit at +${plPct.toFixed(1)}%`,
      });
      continue;
    }

    // Stop loss
    if (plPct <= -ctx.config.stop_loss_pct) {
      exits.push({
        symbol: pos.symbol,
        reason: `Stop loss at ${plPct.toFixed(1)}%`,
      });
      continue;
    }

    // Staleness check
    if (ctx.config.stale_position_enabled) {
      // Get current social volume from strategy state
      const socialSnapshot = ctx.state.get<Record<string, { volume: number }>>("socialSnapshotCache") ?? {};
      const currentSocialVolume = socialSnapshot[pos.symbol]?.volume ?? 0;
      const entry = ctx.positionEntries[pos.symbol];

      const stalenessResult = analyzeStaleness(pos.symbol, pos.current_price, currentSocialVolume, entry, ctx.config);

      // Store for status dashboard visibility
      const stalenessState = ctx.state.get<Record<string, unknown>>("stalenessAnalysis") ?? {};
      stalenessState[pos.symbol] = stalenessResult;
      ctx.state.set("stalenessAnalysis", stalenessState);

      if (stalenessResult.isStale) {
        exits.push({
          symbol: pos.symbol,
          reason: `STALE: ${stalenessResult.reason}`,
        });
      }
    }
  }

  return exits;
}

function checkOptionsExit(pos: Position, ctx: StrategyContext): SellCandidate | null {
  if (!ctx.config.options_enabled) return null;

  const entryPrice = pos.avg_entry_price || pos.current_price;
  const plPct = entryPrice > 0 ? ((pos.current_price - entryPrice) / entryPrice) * 100 : 0;

  if (plPct <= -ctx.config.options_stop_loss_pct) {
    return {
      symbol: pos.symbol,
      reason: `Options stop loss at ${plPct.toFixed(1)}%`,
    };
  }

  if (plPct >= ctx.config.options_take_profit_pct) {
    return {
      symbol: pos.symbol,
      reason: `Options take profit at +${plPct.toFixed(1)}%`,
    };
  }

  return null;
}
