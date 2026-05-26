import { getHarnessStub } from "./durable-objects/mahoraga-harness";
import { checkRateLimit, incrementRequest } from "./durable-objects/session";
import type { Env } from "./env.d";
import { handleCronEvent } from "./jobs/cron";
import { MahoragaMcpAgent } from "./mcp/agent";

export { SessionDO } from "./durable-objects/session";
export { MahoragaMcpAgent };
export { MahoragaHarness } from "./durable-objects/mahoraga-harness";

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = env.MAHORAGA_API_TOKEN;
  if (!token) return false;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  return constantTimeCompare(authHeader.slice(7), token);
}

function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized. Requires: Authorization: Bearer <MAHORAGA_API_TOKEN>" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin.endsWith(".pages.dev") || origin.includes("localhost") || origin.includes("127.0.0.1");
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          name: "mahoraga",
          version: "0.3.0",
          description: "Autonomous LLM-powered trading agent on Cloudflare Workers",
          endpoints: {
            health: "/health",
            mcp: "/mcp (auth required)",
            agent: "/agent/* (auth required)",
          },
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (url.pathname.startsWith("/mcp")) {
      if (!isAuthorized(request, env)) {
        return unauthorizedResponse(corsHeaders);
      }
      return MahoragaMcpAgent.mount("/mcp", { binding: "MCP_AGENT" }).fetch(request, env, ctx);
    }

    if (url.pathname.startsWith("/agent")) {
      if (!isAuthorized(request, env)) {
        return unauthorizedResponse(corsHeaders);
      }

      // Rate limiting via SessionDO
      const tokenHash = request.headers.get("Authorization")?.slice(7, 15) || "anon";
      const rateCheck = await checkRateLimit(env, `agent-${tokenHash}`);
      if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded", resetAt: rateCheck.resetAt }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      await incrementRequest(env, `agent-${tokenHash}`);

      const stub = getHarnessStub(env);
      const agentPath = url.pathname.replace("/agent", "") || "/status";
      const agentUrl = new URL(agentPath, "http://harness");
      agentUrl.search = url.search;
      const res = await stub.fetch(
        new Request(agentUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
        })
      );
      const newRes = new Response(res.body, res);
      for (const [k, v] of Object.entries(corsHeaders)) {
        newRes.headers.set(k, v);
      }
      return newRes;
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cronId = event.cron;
    console.log(`Cron triggered: ${cronId} at ${new Date().toISOString()}`);
    ctx.waitUntil(handleCronEvent(cronId, env));
  },
};
