/**
 * KV caching layer for leaderboard reads.
 *
 * Strategy:
 * - Leaderboard views cached for 15 min (rebuilt by cron every 15 min)
 * - Trader profiles cached for 5 min (invalidated by queue consumer after sync)
 * - Stats cached for 15 min (rebuilt by cron)
 * - Custom filter/sort combinations fall through to D1
 */

const LEADERBOARD_TTL = 900;   // 15 minutes
const TRADER_TTL = 300;        // 5 minutes
const STATS_TTL = 900;         // 15 minutes

// ---------------------------------------------------------------------------
// Leaderboard cache
// ---------------------------------------------------------------------------

export async function getCachedLeaderboard(
  env: Env,
  key: string
): Promise<string | null> {
  return env.KV.get(key, "text");
}

export async function setCachedLeaderboard(
  env: Env,
  key: string,
  data: unknown
): Promise<void> {
  await env.KV.put(key, JSON.stringify(data), { expirationTtl: LEADERBOARD_TTL });
}

// ---------------------------------------------------------------------------
// Stats cache
// ---------------------------------------------------------------------------

export async function getCachedStats(env: Env): Promise<string | null> {
  return env.KV.get("leaderboard:stats", "text");
}

export async function setCachedStats(env: Env, data: unknown): Promise<void> {
  await env.KV.put("leaderboard:stats", JSON.stringify(data), {
    expirationTtl: STATS_TTL,
  });
}

// ---------------------------------------------------------------------------
// Trader profile cache
// ---------------------------------------------------------------------------

export async function getCachedTraderProfile(
  env: Env,
  username: string
): Promise<string | null> {
  return env.KV.get(`trader:${username}`, "text");
}

export async function setCachedTraderProfile(
  env: Env,
  username: string,
  data: unknown
): Promise<void> {
  await env.KV.put(`trader:${username}`, JSON.stringify(data), {
    expirationTtl: TRADER_TTL,
  });
}

// ---------------------------------------------------------------------------
// Trader trades cache
// ---------------------------------------------------------------------------

export async function getCachedTraderTrades(
  env: Env,
  username: string,
  limit: number,
  offset: number
): Promise<string | null> {
  return env.KV.get(`trader:${username}:trades:${limit}:${offset}`, "text");
}

export async function setCachedTraderTrades(
  env: Env,
  username: string,
  limit: number,
  offset: number,
  data: unknown
): Promise<void> {
  await env.KV.put(
    `trader:${username}:trades:${limit}:${offset}`,
    JSON.stringify(data),
    { expirationTtl: TRADER_TTL }
  );
}

// ---------------------------------------------------------------------------
// Trader equity cache
// ---------------------------------------------------------------------------

export async function getCachedTraderEquity(
  env: Env,
  username: string,
  days: number
): Promise<string | null> {
  return env.KV.get(`trader:${username}:equity:${days}`, "text");
}

export async function setCachedTraderEquity(
  env: Env,
  username: string,
  days: number,
  data: unknown
): Promise<void> {
  await env.KV.put(
    `trader:${username}:equity:${days}`,
    JSON.stringify(data),
    { expirationTtl: TRADER_TTL }
  );
}

// ---------------------------------------------------------------------------
// Cache key generation
// ---------------------------------------------------------------------------

export function leaderboardCacheKey(
  period: string,
  sort: string,
  assetClass: string,
  minTrades: number
): string {
  return `leaderboard:${period}:${sort}:${assetClass}:${minTrades}`;
}

// ---------------------------------------------------------------------------
// Targeted invalidation helpers
// ---------------------------------------------------------------------------

/** Invalidate a single trader's profile, trades, and equity caches after sync. */
export async function invalidateTraderCache(
  env: Env,
  username: string
): Promise<void> {
  const list = await env.KV.list({ prefix: `trader:${username}` });
  for (const key of list.keys) {
    await env.KV.delete(key.name);
  }
}

/** Invalidate all leaderboard-prefixed caches (leaderboard views + stats). */
export async function invalidateLeaderboardCaches(env: Env): Promise<void> {
  const list = await env.KV.list({ prefix: "leaderboard:" });
  for (const key of list.keys) {
    await env.KV.delete(key.name);
  }
}

