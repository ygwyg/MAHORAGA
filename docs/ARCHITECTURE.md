# Mahoraga Architecture Reference

> Version 0.3.0 — Cloudflare Workers Durable Object architecture

## Overview

Mahoraga is an autonomous stock/crypto trading agent that runs entirely on Cloudflare Workers. There is no local Node.js process — the `MahoragaHarness` Durable Object runs 24/7 on Cloudflare's edge, triggered by alarms and cron schedules.

**Stack:**

| Layer | Technology |
|-------|-----------|
| Compute | Cloudflare Workers |
| Persistent State | Durable Objects (`MahoragaHarness`, `SessionDO`) |
| Database | D1 (SQLite) — trades, approvals, memory, events |
| Cache | KV — market data, quotes |
| Storage | R2 — research reports, logs, artifacts |
| Trading API | Alpaca (stocks, options, crypto) |
| LLM | OpenAI (GPT-4o / GPT-4o-mini) |
| MCP | `agents` SDK + `@modelcontextprotocol/sdk` |
| Dashboard | React 19 + Vite 6 + Tailwind CSS 4 |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm (not pnpm/yarn — the lockfile is `package-lock.json`)
- A `.dev.vars` file in the project root (see below)

### Setup

```bash
# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Apply D1 migrations locally
npm run db:migrate

# Start the Workers dev server
npx wrangler dev

# In a separate terminal, start the dashboard
cd dashboard && npm run dev
```

The Workers dev server runs on `http://localhost:8787` by default.
The dashboard dev server runs on `http://localhost:5173`.

### `.dev.vars` file

Create `.dev.vars` in the project root with your secrets. This file is gitignored.

```bash
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret
ALPACA_PAPER=true
OPENAI_API_KEY=sk-your_key
TWITTER_BEARER_TOKEN=          # optional
KILL_SWITCH_SECRET=generate_a_random_hex_string
MAHORAGA_API_TOKEN=generate_with_openssl_rand_base64_48
```

See `.env.example` for the full template.

---

## Remote Deployment

```bash
# Deploy Workers
npx wrangler deploy

# Set each secret individually
wrangler secret put ALPACA_API_KEY
wrangler secret put ALPACA_API_SECRET
wrangler secret put ALPACA_PAPER
wrangler secret put OPENAI_API_KEY
wrangler secret put KILL_SWITCH_SECRET
wrangler secret put MAHORAGA_API_TOKEN

# Apply D1 migrations to remote
npm run db:migrate:remote
```

For production environment: `npx wrangler deploy --env production`

---

## API Endpoints & Authentication

All `/mcp` endpoints require a Bearer token:

```
Authorization: Bearer <MAHORAGA_API_TOKEN>
```

The kill switch endpoint uses a separate secret:

```
Authorization: Bearer <KILL_SWITCH_SECRET>
```

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info, version, available endpoints |
| GET | `/health` | Health check (`{ status: "ok", timestamp, environment }`) |

### Agent Control (delegated to MahoragaHarness DO)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agent/status` | Full agent state: enabled, positions, signals, logs, costs |
| POST | `/agent/enable` | Start the agent's 30-second alarm loop |
| POST | `/agent/disable` | Pause the agent |
| GET/POST | `/agent/config` | Get or update trading parameters |
| GET | `/agent/logs?limit=100` | Recent log entries |
| GET | `/agent/costs` | LLM cost tracker |
| GET | `/agent/signals` | Current signal cache |
| POST | `/agent/trigger` | Force an immediate alarm run |
| POST | `/agent/kill` | Emergency stop (requires `KILL_SWITCH_SECRET`) |

### MCP Tools (via `/mcp`, all require Bearer token)

The MCP server exposes ~40 tools for LLM-driven interaction:

- **Trading:** `orders-preview`, `orders-submit`, `positions-list`, `positions-close`
- **Market Data:** `market-quote`, `quotes-batch`, `market-movers`, `market-clock`
- **Technical Analysis:** `signals-get`, `signals-batch`, `prices-bars`
- **Options:** `options-chain`, `options-expirations`, `options-snapshot`, `options-order-preview/submit`
- **Risk:** `risk-status`, `kill-switch-enable/disable`
- **Research:** `news-list`, `events-list`, `events-classify`, `symbol-overview`, `symbol-research`
- **Memory:** `memory-query`, `memory-log-trade`, `memory-get-preferences`
- **Account:** `accounts-get`, `portfolio-get`, `auth-verify`

---

## Cron Schedule

Defined in `wrangler.jsonc`. All times are UTC:

| Cron | UTC | EST | Purpose |
|------|-----|-----|---------|
| `*/5 13-20 * * 1-5` | 1–8pm | 8am–3pm | Event ingestion (SEC Edgar polling) |
| `0 14 * * 1-5` | 2pm | 9am | Market open prep (cleanup expired approvals) |
| `30 21 * * 1-5` | 9:30pm | 4:30pm | Market close cleanup (log end-of-day stats) |
| `0 5 * * *` | 5am | 12am | Midnight reset (daily loss counter) |
| `0 * * * *` | Every hour | — | Hourly cache refresh |

The MahoragaHarness DO also runs its own internal alarm loop every 30 seconds when enabled, which handles:
- Signal gathering from StockTwits, Reddit, crypto sources
- LLM-powered signal research (every 2 minutes)
- Trade execution based on analyst logic
- Position monitoring (staleness, options exits)
- Pre-market analysis during market hours

---

## Customization Points in `mahoraga-harness.ts`

The harness source code marks customization points with comments:

- **`[CUSTOMIZE]`** — Modify for your trading strategy (e.g., buy/sell logic, signal sources)
- **`[TUNE]`** — Adjust numeric parameters (risk thresholds, intervals, position sizing)
- **`[CUSTOMIZABLE]`** — Extension points for adding new data sources or logic

### Key Config Parameters (via `/agent/config`)

```json
{
  "data_poll_interval_ms": 30000,
  "analyst_interval_ms": 120000,
  "max_position_value": 5000,
  "max_positions": 5,
  "min_sentiment_score": 0.3,
  "min_analyst_confidence": 0.6,
  "sell_sentiment_threshold": -0.2,
  "take_profit_pct": 10,
  "stop_loss_pct": 5,
  "crypto_enabled": false,
  "options_enabled": false,
  "llm_model": "gpt-4o-mini",
  "llm_analyst_model": "gpt-4o"
}
```

### Source Weights

Signal sources are weighted differently. Adjust in `SOURCE_CONFIG`:

| Source | Weight |
|--------|--------|
| `twitter_fintwit` | 0.95 |
| `twitter_news` | 0.90 |
| `reddit_stocks` | 0.90 |
| `reddit_options` | 0.85 |
| `stocktwits` | 0.85 |
| `reddit_investing` | 0.80 |
| `reddit_wallstreetbets` | 0.60 |

Reddit flair multipliers boost/penalize signals: DD (1.5x), Technical Analysis (1.3x), YOLO (0.6x), Shitpost (0.3x).

---

## Cloudflare Bindings (from `wrangler.jsonc`)

| Binding | Type | Name |
|---------|------|------|
| `DB` | D1 Database | `mahoraga-db` |
| `CACHE` | KV Namespace | (placeholder ID) |
| `ARTIFACTS` | R2 Bucket | `mahoraga-artifacts` |
| `SESSION` | Durable Object | `SessionDO` |
| `MCP_AGENT` | Durable Object | `MahoragaMcpAgent` |
| `MAHORAGA_HARNESS` | Durable Object | `MahoragaHarness` |

### Feature Flags (set in `wrangler.jsonc` vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `FEATURE_LLM_RESEARCH` | `"true"` | Enable LLM-powered signal research |
| `FEATURE_OPTIONS` | `"true"` | Enable options trading tools |

### Risk Defaults

| Var | Default | Purpose |
|-----|---------|---------|
| `DEFAULT_MAX_POSITION_PCT` | `0.10` | Max 10% of account per position |
| `DEFAULT_MAX_NOTIONAL_PER_TRADE` | `5000` | $5,000 max per trade |
| `DEFAULT_MAX_DAILY_LOSS_PCT` | `0.02` | 2% daily loss limit |
| `DEFAULT_COOLDOWN_MINUTES` | `30` | Cooldown between trades |
| `DEFAULT_MAX_OPEN_POSITIONS` | `10` | Max concurrent positions |
| `DEFAULT_APPROVAL_TTL_SECONDS` | `300` | 5-minute approval window |

---

## npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start wrangler dev server (local) |
| `npm run build` | TypeScript compilation |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run deploy:production` | Deploy to production env |
| `npm run db:migrate` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to remote |
| `npm run typecheck` | Type-check without emitting |
| `npm run test` | Run vitest in watch mode |
| `npm run test:run` | Run vitest once |
