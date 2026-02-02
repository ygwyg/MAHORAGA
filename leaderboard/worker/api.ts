/**
 * API handler functions for the leaderboard worker.
 *
 * Organized by concern:
 * - Leaderboard (list + stats)
 * - Trader profile (profile + trades + equity)
 * - Manual sync trigger
 * - OAuth flow (authorize + callback)
 * - Registration
 */

import { encryptToken } from "./crypto";
import {
  getCachedLeaderboard,
  getCachedStats,
  getCachedTraderProfile,
  setCachedTraderProfile,
  getCachedTraderTrades,
  setCachedTraderTrades,
  getCachedTraderEquity,
  setCachedTraderEquity,
  leaderboardCacheKey,
} from "./cache";
import { json, safeParseInt, errorJson } from "./helpers";
import type {
  SyncMessage,
  TraderDbRow,
  SnapshotDbRow,
  OAuthTokenDbRow,
} from "./types";

const ALPACA_PAPER_API = "https://paper-api.alpaca.markets";

// ---------------------------------------------------------------------------
// Leaderboard query options
// ---------------------------------------------------------------------------

export interface LeaderboardQueryOptions {
  period: string;
  sort: string;
  assetClass: string;
  minTrades: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";
  const sort = url.searchParams.get("sort") || "composite_score";
  const assetClass = url.searchParams.get("asset_class") || "all";
  const minTrades = safeParseInt(url.searchParams.get("min_trades"), 10);
  const limit = Math.min(safeParseInt(url.searchParams.get("limit"), 50), 100);
  const offset = safeParseInt(url.searchParams.get("offset"), 0);

  // Check KV cache (only for default pagination)
  const cacheKey = leaderboardCacheKey(period, sort, assetClass, minTrades);
  const cached = await getCachedLeaderboard(env, cacheKey);
  if (cached && offset === 0 && limit === 50) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await queryLeaderboard(env, {
    period, sort, assetClass, minTrades, limit, offset,
  });
  return json(data);
}

export async function queryLeaderboard(env: Env, opts: LeaderboardQueryOptions) {
  const { period, sort, assetClass, minTrades, limit, offset } = opts;

  const allowedSorts = [
    "composite_score", "total_pnl_pct", "total_pnl",
    "sharpe_ratio", "win_rate", "max_drawdown_pct", "num_trades",
  ];
  const sortCol = allowedSorts.includes(sort) ? sort : "composite_score";
  const sortDir = sortCol === "max_drawdown_pct" ? "ASC" : "DESC";

  let query = `
    SELECT
      t.id, t.username, t.github_repo, t.asset_class,
      t.joined_at,
      ps.equity, ps.total_pnl, ps.total_pnl_pct, ps.total_deposits,
      ps.sharpe_ratio, ps.win_rate, ps.max_drawdown_pct,
      ps.num_trades, ps.composite_score, ps.open_positions, ps.snapshot_date
    FROM traders t
    INNER JOIN performance_snapshots ps ON ps.trader_id = t.id
    INNER JOIN (
      SELECT trader_id, MAX(snapshot_date) as latest_date
      FROM performance_snapshots
      WHERE snapshot_date >= date('now', '-' || ?1 || ' days')
      GROUP BY trader_id
    ) latest ON ps.trader_id = latest.trader_id AND ps.snapshot_date = latest.latest_date
    WHERE t.is_active = 1 AND ps.num_trades >= ?2
  `;

  const params: (string | number)[] = [period, minTrades];

  if (assetClass !== "all") {
    query += ` AND (t.asset_class = ?${params.length + 1} OR t.asset_class = 'both')`;
    params.push(assetClass);
  }
  query += ` ORDER BY ps.${sortCol} ${sortDir} NULLS LAST`;
  query += ` LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`;
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all();

  // Attach sparkline data via single D1.batch() call (was N+1 individual queries)
  const sparklineStatements = result.results.map((trader) =>
    env.DB.prepare(
      `SELECT equity FROM equity_history
       WHERE trader_id = ?1
       ORDER BY timestamp DESC LIMIT 30`
    ).bind(trader.id)
  );

  const sparklineResults = sparklineStatements.length > 0
    ? await env.DB.batch(sparklineStatements)
    : [];

  const tradersWithSparklines = result.results.map((trader, i) => ({
    ...trader,
    sparkline: (sparklineResults[i]?.results ?? [])
      .map((r) => (r as Record<string, unknown>).equity as number)
      .reverse(),
  }));

  return {
    traders: tradersWithSparklines,
    meta: { limit, offset, period, sort: sortCol },
  };
}

export async function getLeaderboardStats(env: Env): Promise<Response> {
  const cached = await getCachedStats(env);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const stats = await queryStats(env);
  return json(stats);
}

export async function queryStats(env: Env) {
  const [statsResult, tradeCountResult, pnlSumResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) as total_traders
      FROM traders WHERE is_active = 1
    `),
    env.DB.prepare(`SELECT COUNT(*) as c FROM trades`),
    env.DB.prepare(`
      SELECT COALESCE(SUM(ps.total_pnl), 0) as total_pnl
      FROM performance_snapshots ps
      INNER JOIN (
        SELECT trader_id, MAX(snapshot_date) as d
        FROM performance_snapshots GROUP BY trader_id
      ) latest ON ps.trader_id = latest.trader_id AND ps.snapshot_date = latest.d
    `),
  ]);

  const stats = statsResult.results[0] as Record<string, unknown> | undefined;
  const tradeCount = tradeCountResult.results[0] as Record<string, unknown> | undefined;
  const pnlSum = pnlSumResult.results[0] as Record<string, unknown> | undefined;

  return {
    total_traders: (stats?.total_traders as number) || 0,
    total_trades: (tradeCount?.c as number) || 0,
    total_pnl: (pnlSum?.total_pnl as number) || 0,
  };
}

// ---------------------------------------------------------------------------
// Trader Profile
// ---------------------------------------------------------------------------

export async function getTraderProfile(username: string, env: Env): Promise<Response> {
  const cached = await getCachedTraderProfile(env, username);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const trader = await env.DB.prepare(
    `SELECT id, username, github_repo, asset_class,
            joined_at, last_synced_at
     FROM traders WHERE username = ?1 AND is_active = 1`
  ).bind(username).first<Pick<TraderDbRow, "id" | "username" | "github_repo" | "asset_class" | "joined_at" | "last_synced_at">>();

  if (!trader) return json({ error: "Trader not found" }, 404);

  const snapshot = await env.DB.prepare(
    `SELECT * FROM performance_snapshots
     WHERE trader_id = ?1 ORDER BY snapshot_date DESC LIMIT 1`
  ).bind(trader.id).first<SnapshotDbRow>();

  const data = { trader, snapshot };
  await setCachedTraderProfile(env, username, data);
  return json(data);
}

export async function getTraderTrades(
  username: string,
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(safeParseInt(url.searchParams.get("limit"), 50), 100);
  const offset = safeParseInt(url.searchParams.get("offset"), 0);

  const cached = await getCachedTraderTrades(env, username, limit, offset);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const trader = await env.DB.prepare(
    `SELECT id FROM traders WHERE username = ?1 AND is_active = 1`
  ).bind(username).first<Pick<TraderDbRow, "id">>();

  if (!trader) return json({ error: "Trader not found" }, 404);

  const result = await env.DB.prepare(
    `SELECT symbol, side, qty, price, filled_at, asset_class
     FROM trades WHERE trader_id = ?1 ORDER BY filled_at DESC
     LIMIT ?2 OFFSET ?3`
  ).bind(trader.id, limit, offset).all();

  const data = { trades: result.results, meta: { limit, offset } };
  await setCachedTraderTrades(env, username, limit, offset, data);
  return json(data);
}

export async function getTraderEquity(
  username: string,
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.min(safeParseInt(url.searchParams.get("days"), 90), 365);

  const cached = await getCachedTraderEquity(env, username, days);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json" },
    });
  }

  const trader = await env.DB.prepare(
    `SELECT id FROM traders WHERE username = ?1 AND is_active = 1`
  ).bind(username).first<Pick<TraderDbRow, "id">>();

  if (!trader) return json({ error: "Trader not found" }, 404);

  const result = await env.DB.prepare(
    `SELECT timestamp, equity, profit_loss, profit_loss_pct
     FROM equity_history
     WHERE trader_id = ?1 AND timestamp >= datetime('now', '-' || ?2 || ' days')
     ORDER BY timestamp ASC`
  ).bind(trader.id, days).all();

  const data = { equity: result.results };
  await setCachedTraderEquity(env, username, days, data);
  return json(data);
}

// ---------------------------------------------------------------------------
// Registration + OAuth (atomic — no D1 record until OAuth completes)
// ---------------------------------------------------------------------------

interface PendingRegistration {
  username: string;
  github_repo: string;
}

/**
 * POST /api/register — Validates inputs, reserves username in KV, and returns
 * the Alpaca OAuth URL. No D1 record is created until the OAuth callback.
 */
export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    username?: string;
    github_repo?: string;
  };

  if (!body.username || !body.github_repo) {
    return json({ error: "username and github_repo are required" }, 400);
  }

  const username = body.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return json({
      error: "Username must be 3-20 characters, lowercase alphanumeric and underscores only",
    }, 400);
  }

  // Validate GitHub URL
  let repoUrl: URL;
  try {
    repoUrl = new URL(body.github_repo);
  } catch {
    return json({ error: "Invalid GitHub URL" }, 400);
  }
  if (repoUrl.hostname !== "github.com") {
    return json({ error: "Repository URL must be on github.com" }, 400);
  }

  // Check D1 for existing username
  const existing = await env.DB.prepare(
    `SELECT id FROM traders WHERE username = ?1`
  ).bind(username).first<Pick<TraderDbRow, "id">>();

  if (existing) return json({ error: "Username already taken" }, 409);

  // Store pending registration in KV (10 min TTL) — no D1 write yet
  const nonce = crypto.randomUUID();
  const pending: PendingRegistration = {
    username,
    github_repo: body.github_repo.trim(),
  };
  await env.KV.put(`pending_reg:${nonce}`, JSON.stringify(pending), {
    expirationTtl: 600,
  });

  // Build Alpaca OAuth URL
  const state = btoa(JSON.stringify({ nonce }));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.ALPACA_OAUTH_CLIENT_ID,
    redirect_uri: env.ALPACA_OAUTH_REDIRECT_URI,
    state,
    env: "paper",
  });

  return json({
    redirect: `https://app.alpaca.markets/oauth/authorize?${params}`,
  });
}

/**
 * GET /api/oauth/callback — Alpaca redirects here after the user authorizes.
 * Creates the trader record + oauth_token in a single D1.batch() — atomic.
 */
export async function handleOAuthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return json({ error: "Missing code or state" }, 400);

  let stateData: { nonce: string };
  try {
    stateData = JSON.parse(atob(state));
  } catch {
    return json({ error: "Invalid state" }, 400);
  }

  // Retrieve pending registration from KV (one-time use)
  const pendingJson = await env.KV.get(`pending_reg:${stateData.nonce}`);
  if (!pendingJson) {
    return json({ error: "Registration expired or already completed" }, 403);
  }
  await env.KV.delete(`pending_reg:${stateData.nonce}`);

  const pending: PendingRegistration = JSON.parse(pendingJson);

  // Re-check username uniqueness (could have been taken during OAuth flow)
  const existing = await env.DB.prepare(
    `SELECT id FROM traders WHERE username = ?1`
  ).bind(pending.username).first<Pick<TraderDbRow, "id">>();

  if (existing) {
    return json({ error: "Username was taken while you were connecting Alpaca" }, 409);
  }

  // Exchange code for token
  const tokenRes = await fetch("https://api.alpaca.markets/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.ALPACA_OAUTH_CLIENT_ID,
      client_secret: env.ALPACA_OAUTH_CLIENT_SECRET,
      redirect_uri: env.ALPACA_OAUTH_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    console.error("OAuth token exchange failed:", tokenRes.status, await tokenRes.text());
    return errorJson("OAuth token exchange failed", 502);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    token_type: string;
    scope: string;
  };

  // Verify paper account access
  const accountRes = await fetch(`${ALPACA_PAPER_API}/v2/account`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!accountRes.ok) {
    return errorJson("Failed to verify Alpaca paper account", 502);
  }

  const account = (await accountRes.json()) as { id: string };

  // Dedup: ensure this Alpaca account isn't already linked to another trader
  const linkedTrader = await env.DB.prepare(
    `SELECT trader_id FROM oauth_tokens WHERE alpaca_account_id = ?1`
  ).bind(account.id).first<Pick<OAuthTokenDbRow, "trader_id">>();

  if (linkedTrader) {
    return json(
      { error: "This Alpaca account is already linked to another profile" },
      409
    );
  }

  // Create trader + store encrypted token atomically
  const traderId = crypto.randomUUID();
  const encryptedToken = await encryptToken(
    tokenData.access_token,
    env.ENCRYPTION_KEY,
    traderId
  );

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO traders (id, username, github_repo)
       VALUES (?1, ?2, ?3)`
    ).bind(traderId, pending.username, pending.github_repo),
    env.DB.prepare(
      `INSERT INTO oauth_tokens (trader_id, access_token_encrypted, alpaca_account_id)
       VALUES (?1, ?2, ?3)`
    ).bind(traderId, encryptedToken, account.id),
  ]);

  // Enqueue immediate first sync
  await env.SYNC_QUEUE.send(
    { traderId } satisfies SyncMessage,
    { delaySeconds: 0 }
  );

  return Response.redirect(
    `/trader/${pending.username}?registered=true`,
    302
  );
}
