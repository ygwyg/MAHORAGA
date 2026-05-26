/**
 * Active Strategy Selector
 *
 * This is the ONE line you change to use a custom strategy.
 * The default strategy ships with the repo and replicates the
 * original harness behavior (StockTwits, Reddit, SEC, crypto, Twitter).
 *
 * To use a custom strategy:
 *   import { myStrategy } from "./my-strategy";
 *   export const activeStrategy: Strategy = myStrategy;
 */

import { defaultStrategy } from "./default";
import type { Strategy } from "./types";

export const activeStrategy: Strategy = defaultStrategy;
