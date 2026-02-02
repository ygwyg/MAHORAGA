/**
 * MAHORAGA Leaderboard Worker — Entry Point
 *
 * Thin router that delegates to:
 * - api.ts — HTTP API handlers (leaderboard, trader, OAuth, registration)
 * - queue.ts — Queue consumer (per-trader Alpaca sync)
 * - cron.ts — Scheduled cycle (scores, tiers, caches)
 */

import { SyncerDO } from "./syncer";
import { corsHeaders, errorJson } from "./helpers";
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
import type { SyncMessage } from "./types";

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
      const response = await handleApi(request, env, path);
      for (const [key, value] of Object.entries(corsHeaders())) {
        response.headers.set(key, value);
      }
      return response;
    }

    return new Response(null, { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronCycle(env));
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await processSyncMessage(message as Message<SyncMessage>, env);
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

    return errorJson("Not found", 404);
  } catch (err) {
    console.error("API error:", err);
    return errorJson("Internal server error", 500);
  }
}
