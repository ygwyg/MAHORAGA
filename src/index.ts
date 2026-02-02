import type { Env } from "./env.d";
import { MahoragaMcpAgent } from "./mcp/agent";
import { handleCronEvent } from "./jobs/cron";
import { getHarnessStub } from "./durable-objects/mahoraga-harness";
import { isAuthorized } from "./lib/auth";

export { SessionDO } from "./durable-objects/session";
export { MahoragaMcpAgent };
export { MahoragaHarness } from "./durable-objects/mahoraga-harness";

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized. Requires: Authorization: Bearer <MAHORAGA_API_TOKEN>" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
        }),
        {
          headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.pathname.startsWith("/mcp")) {
      if (!isAuthorized(request, env.MAHORAGA_API_TOKEN)) {
        return unauthorizedResponse();
      }
      return MahoragaMcpAgent.mount("/mcp", { binding: "MCP_AGENT" }).fetch(request, env, ctx);
    }

    if (url.pathname.startsWith("/agent")) {
      const stub = getHarnessStub(env);
      const agentPath = url.pathname.replace("/agent", "") || "/status";
      const agentUrl = new URL(agentPath, "http://harness");
      agentUrl.search = url.search;
      return stub.fetch(new Request(agentUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      }));
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const cronId = event.cron;
    console.log(`Cron triggered: ${cronId} at ${new Date().toISOString()}`);
    ctx.waitUntil(handleCronEvent(cronId, env));
  },
};
