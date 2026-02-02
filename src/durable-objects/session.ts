import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.d";

interface SessionState {
  authenticated: boolean;
  authenticatedAt: string | null;
  requestCount: number;
  lastRequestAt: string | null;
  rateLimitResetAt: string | null;
  metadata: Record<string, unknown>;
}

const DEFAULT_STATE: SessionState = {
  authenticated: false,
  authenticatedAt: null,
  requestCount: 0,
  lastRequestAt: null,
  rateLimitResetAt: null,
  metadata: {},
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

export class SessionDO extends DurableObject<Env> {
  private state: SessionState = { ...DEFAULT_STATE };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<SessionState>("state");
      if (stored) {
        this.state = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.slice(1);

    try {
      switch (action) {
        case "get":
          return this.jsonResponse(this.state);

        case "authenticate":
          return this.handleAuthenticate();

        case "deauthenticate":
          return this.handleDeauthenticate();

        case "check-rate-limit":
          return this.handleCheckRateLimit();

        case "increment-request":
          return this.handleIncrementRequest();

        case "set-metadata":
          return this.handleSetMetadata(request);

        case "reset":
          return this.handleReset();

        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private async handleAuthenticate(): Promise<Response> {
    this.state.authenticated = true;
    this.state.authenticatedAt = new Date().toISOString();
    await this.persist();
    return this.jsonResponse({ ok: true });
  }

  private async handleDeauthenticate(): Promise<Response> {
    this.state.authenticated = false;
    this.state.authenticatedAt = null;
    await this.persist();
    return this.jsonResponse({ ok: true });
  }

  private async handleCheckRateLimit(): Promise<Response> {
    const now = Date.now();
    const resetAt = this.state.rateLimitResetAt
      ? new Date(this.state.rateLimitResetAt).getTime()
      : 0;

    if (now > resetAt) {
      this.state.requestCount = 0;
      this.state.rateLimitResetAt = new Date(now + RATE_LIMIT_WINDOW_MS).toISOString();
      await this.persist();
    }

    const allowed = this.state.requestCount < RATE_LIMIT_MAX_REQUESTS;
    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - this.state.requestCount);

    return this.jsonResponse({
      allowed,
      remaining,
      resetAt: this.state.rateLimitResetAt,
    });
  }

  private async handleIncrementRequest(): Promise<Response> {
    const now = Date.now();
    const resetAt = this.state.rateLimitResetAt
      ? new Date(this.state.rateLimitResetAt).getTime()
      : 0;

    if (now > resetAt) {
      this.state.requestCount = 1;
      this.state.rateLimitResetAt = new Date(now + RATE_LIMIT_WINDOW_MS).toISOString();
    } else {
      this.state.requestCount++;
    }

    this.state.lastRequestAt = new Date().toISOString();
    await this.persist();

    return this.jsonResponse({
      requestCount: this.state.requestCount,
      lastRequestAt: this.state.lastRequestAt,
    });
  }

  private async handleSetMetadata(request: Request): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    this.state.metadata = { ...this.state.metadata, ...body };
    await this.persist();
    return this.jsonResponse({ ok: true, metadata: this.state.metadata });
  }

  private async handleReset(): Promise<Response> {
    this.state = { ...DEFAULT_STATE };
    await this.persist();
    return this.jsonResponse({ ok: true });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("state", this.state);
  }

  private jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
