/**
 * MAHORAGA Leaderboard Worker — Entry Point
 *
 * Thin router that delegates to:
 * - api.ts — HTTP API handlers (leaderboard, trader, OAuth, registration)
 * - queue.ts — Queue consumer (per-trader Alpaca sync)
 * - cron.ts — Scheduled cycle (scores, tiers, caches)
 */

import { SyncerDO } from "./syncer";
import { corsHeaders, errorJson, json } from "./helpers";
import { processSyncMessage } from "./queue";
import { runCronCycle } from "./cron";
import {
  getLeaderboard,
  getLeaderboardStats,
  getTraderProfile,
  getTraderTrades,
  getTraderEquity,
  handleOAuthCallback,
  handleRegister,
} from "./api";
import { decryptToken } from "./crypto";
import { invalidateTraderCache } from "./cache";
import type { SyncMessage, TraderWithTokenRow } from "./types";

// Re-export DO class so the Vite plugin bundles it
export { SyncerDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, { headers: corsHeaders() });
    }

    if (path.startsWith("/api/")) {
      const raw = await handleApi(request, env, path);
      // Response.redirect() returns immutable headers — clone to make mutable
      const response = new Response(raw.body, raw);
      for (const [key, value] of Object.entries(corsHeaders())) {
        response.headers.set(key, value);
      }
      return response;
    }

    return new Response(null, { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCronCycle(env).catch((err) => {
        console.error("[scheduled] Cron cycle failed:", err instanceof Error ? err.message : err);
      })
    );
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processSyncMessage(message as Message<SyncMessage>, env);
      } catch (err) {
        console.error("[queue] Unhandled error processing message:", err instanceof Error ? err.message : err);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// API Router
// ---------------------------------------------------------------------------

async function handleApi(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  try {
    // Leaderboard
    if (path === "/api/leaderboard" && request.method === "GET") {
      return await getLeaderboard(request, env);
    }
    if (path === "/api/leaderboard/stats" && request.method === "GET") {
      return await getLeaderboardStats(env);
    }

    // Trader profile + data
    const traderMatch = path.match(/^\/api\/trader\/([a-zA-Z0-9_]+)$/);
    if (traderMatch && request.method === "GET") {
      return await getTraderProfile(traderMatch[1], env);
    }

    const tradesMatch = path.match(/^\/api\/trader\/([a-zA-Z0-9_]+)\/trades$/);
    if (tradesMatch && request.method === "GET") {
      return await getTraderTrades(tradesMatch[1], request, env);
    }

    const equityMatch = path.match(/^\/api\/trader\/([a-zA-Z0-9_]+)\/equity$/);
    if (equityMatch && request.method === "GET") {
      return await getTraderEquity(equityMatch[1], request, env);
    }

    // OAuth callback (authorize URL is returned by /api/register)
    if (path === "/api/oauth/callback" && request.method === "GET") {
      return await handleOAuthCallback(request, env);
    }

    // Registration
    if (path === "/api/register" && request.method === "POST") {
      return await handleRegister(request, env);
    }

    // Dev-only: manual sync trigger (bypasses queue)
    const devSyncMatch = path.match(/^\/api\/dev\/sync\/([a-zA-Z0-9_]+)$/);
    if (devSyncMatch && request.method === "POST") {
      if (!env.ALPACA_OAUTH_REDIRECT_URI.includes("localhost")) {
        return errorJson("Not found", 404);
      }
      return await handleDevSync(devSyncMatch[1], env);
    }

    return errorJson("Not found", 404);
  } catch (err) {
    console.error(`[api] ${request.method} ${path} error:`, err instanceof Error ? err.message : err);
    return errorJson("Internal server error", 500);
  }
}

// ---------------------------------------------------------------------------
// Dev-only: Manual Sync (bypasses queue for local testing)
// ---------------------------------------------------------------------------

async function handleDevSync(username: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT t.id, t.username, t.is_active,
            ot.access_token_encrypted
     FROM traders t
     LEFT JOIN oauth_tokens ot ON ot.trader_id = t.id
     WHERE t.username = ?1`
  ).bind(username).first<{ id: string; username: string; is_active: number; access_token_encrypted: string | null }>();

  if (!row) return json({ error: "Trader not found" }, 404);
  if (!row.access_token_encrypted) return json({ error: "No OAuth token" }, 400);

  let token: string;
  try {
    token = await decryptToken(row.access_token_encrypted, env.ENCRYPTION_KEY, row.id);
  } catch (err) {
    console.error(`[dev-sync] Decrypt failed for ${username}:`, err instanceof Error ? err.message : err);
    return json({ error: "Failed to decrypt token" }, 500);
  }

  const doId = env.SYNCER.idFromName(row.id);
  const stub = env.SYNCER.get(doId);
  const result = await stub.sync(row.id, token);

  if (result.success) {
    await invalidateTraderCache(env, username);
  }

  return json(result);
}
