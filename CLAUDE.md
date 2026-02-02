# CLAUDE.md

## Project Overview

MAHORAGA is an autonomous AI trading agent running entirely on Cloudflare Workers (no local Node.js process). The `MahoragaHarness` Durable Object runs 24/7 on Cloudflare's edge, gathering social sentiment signals, analyzing them with OpenAI, and executing trades via Alpaca.

## Tech Stack

- **Runtime:** Cloudflare Workers (Durable Objects, D1, KV, R2)
- **Language:** TypeScript (strict mode, ES2022, bundler resolution)
- **Package manager:** npm (NOT pnpm or yarn — lockfile is `package-lock.json`)
- **Dashboard:** React 19 + Vite 6 + Tailwind CSS 4 (separate app in `dashboard/`)
- **Trading API:** Alpaca (stocks, options, crypto)
- **LLM:** OpenAI (GPT-4o, GPT-4o-mini)
- **MCP:** `agents` SDK + `@modelcontextprotocol/sdk`

## Common Commands

```bash
# Root (Worker)
npm run dev                    # Start wrangler dev server (localhost:8787)
npm run build                  # TypeScript compilation
npm run deploy                 # Deploy to Cloudflare Workers
npm run deploy:production      # Deploy to production env
npm run db:migrate             # Apply D1 migrations locally
npm run db:migrate:remote      # Apply D1 migrations to remote
npm run typecheck              # Type-check without emitting
npm run test                   # Vitest watch mode
npm run test:run               # Vitest single run

# Dashboard (from dashboard/)
npm run dev                    # Vite dev server (localhost:3000, proxies /api → worker /agent)
npm run build                  # Production build
```

## Architecture

```
src/
  index.ts                     # Worker entry point — routes, auth middleware
  env.d.ts                     # Env interface (all bindings + secrets)
  durable-objects/
    mahoraga-harness.ts        # THE AGENT — signal gathering, LLM analysis, trade execution
    session.ts                 # Session state + rate limiting (100 req/60s)
  mcp/
    agent.ts                   # MCP server (~40 tools for LLM interaction)
  jobs/
    cron.ts                    # Scheduled handlers (SEC Edgar, cleanup, resets)
  policy/                      # Risk management: approval tokens, position limits
  providers/
    alpaca/                    # Trading, market data, options
    llm/                       # OpenAI integration
  storage/
    d1/queries/                # SQL query builders per table
dashboard/                     # Standalone React app (NOT served by worker)
migrations/                    # D1 schema (3 files: core, memory, events)
docs/                          # HTML documentation site (served at mahoraga.dev)
```

## Key Architecture Decisions

- **No `agent-v1.mjs`** — the old local Node script was replaced by the `MahoragaHarness` Durable Object. Everything runs on Cloudflare.
- **Two-step order execution** — `orders-preview` returns HMAC-signed approval token (5-min TTL), `orders-submit` requires the token. Prevents accidental or unauthorized trades.
- **Separate kill switch secret** — `KILL_SWITCH_SECRET` is distinct from `MAHORAGA_API_TOKEN` so a compromised API token can't disable the emergency stop.
- **Dashboard connects via Vite proxy** — `dashboard/vite.config.ts` proxies `/api` → `localhost:8787/agent`. Dashboard is NOT embedded in the worker.

## Auth Model

- `GET /` and `GET /health` — public, no auth
- `POST /mcp*` — requires `Authorization: Bearer <MAHORAGA_API_TOKEN>`
- `/agent/*` — auth validated inside MahoragaHarness DO
- `POST /agent/kill` — requires `Authorization: Bearer <KILL_SWITCH_SECRET>`
- Auth uses constant-time string comparison (`constantTimeCompare()`)

## Secrets & Environment

**Local secrets** go in `.dev.vars` (gitignored). **Remote secrets** set via `wrangler secret put <NAME>`.

Required secrets: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_PAPER`, `OPENAI_API_KEY`, `KILL_SWITCH_SECRET`, `MAHORAGA_API_TOKEN`

Optional: `TWITTER_BEARER_TOKEN`, `DISCORD_WEBHOOK_URL`

Feature flags and risk defaults are set as `vars` in `wrangler.jsonc`, NOT as secrets.

## Deployment Gotchas

- **wrangler.jsonc has placeholder IDs** — `d1_databases[0].database_id` and `kv_namespaces[0].id` say "placeholder-will-be-replaced-after-create". You must create the resources and paste real IDs before remote deploy.
- **Custom domain not yet configured** — `mahoraga.dev` is a landing page (static HTML docs). The worker deploys to `*.workers.dev` by default. Custom domain requires adding routes in `wrangler.jsonc`.
- **Cron triggers don't fire locally** — use `curl http://localhost:8787/cdn-cgi/handler/scheduled` to test.
- **`ALPACA_PAPER=true` is critical** — setting to `false` trades real money.

## Git Remotes

- `origin` — fork (`kalepail/MAHORAGA`)
- `upstream` — source (`ygwyg/MAHORAGA`)
- CI auto-closes PRs from non-collaborators (`.github/workflows/auto-close-pr.yml`)

## Customization Points in Code

The harness marks extensibility points with comments:
- `[CUSTOMIZE]` — modify trading strategy (buy/sell logic, signal sources)
- `[TUNE]` — adjust numeric parameters (risk thresholds, intervals, position sizing)
- `[CUSTOMIZABLE]` — add new data sources or logic
