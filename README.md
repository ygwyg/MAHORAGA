⚠️ **Warning:** This software is provided for educational and informational purposes only. Nothing in this repository constitutes financial, investment, legal, or tax advice.

# MAHORAGA

An autonomous, LLM-powered trading agent that runs 24/7 on Cloudflare Workers.

[![Discord](https://img.shields.io/discord/1467592472158015553?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/vMFnHe2YBh)

MAHORAGA monitors social sentiment from StockTwits and Reddit, uses AI (OpenAI, Anthropic, Google, xAI, DeepSeek via AI SDK) to analyze signals, and executes trades through Alpaca. It runs as a Cloudflare Durable Object with persistent state, automatic restarts, and 24/7 crypto trading support.

<img width="1278" height="957" alt="dashboard" src="https://github.com/user-attachments/assets/56473ab6-e2c6-45fc-9e32-cf85e69f1a2d" />

## Features

- **24/7 Operation** — Runs on Cloudflare Workers, no local machine required
- **Multi-Source Signals** — StockTwits, Reddit (4 subreddits), Twitter confirmation
- **Multi-Provider LLM** — OpenAI, Anthropic, Google, xAI, DeepSeek via AI SDK or Cloudflare AI Gateway
- **Crypto Trading** — Trade BTC, ETH, SOL around the clock
- **Options Support** — High-conviction options plays
- **Staleness Detection** — Auto-exit positions that lose momentum
- **Pre-Market Analysis** — Prepare trading plans before market open
- **Discord Notifications** — Get alerts on BUY signals
- **Pluggable Strategy System** — Create custom strategies without touching core files

## Requirements

- Node.js 18+
- Cloudflare account (free tier works)
- Alpaca account (free, paper trading supported)
- LLM API key (OpenAI, Anthropic, Google, xAI, DeepSeek) or Cloudflare AI Gateway credentials

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ygwyg/MAHORAGA.git
cd mahoraga
npm install
```

### 2. Create Cloudflare resources

```bash
# Create D1 database
npx wrangler d1 create mahoraga-db
# Copy the database_id to wrangler.jsonc

# Create KV namespace
npx wrangler kv namespace create CACHE
# Copy the id to wrangler.jsonc

# Run migrations
npx wrangler d1 migrations apply mahoraga-db
```

### 3. Set secrets

```bash
# Required
npx wrangler secret put ALPACA_API_KEY
npx wrangler secret put ALPACA_API_SECRET

# API Authentication - generate a secure random token (64+ chars recommended)
# Example: openssl rand -base64 48
npx wrangler secret put MAHORAGA_API_TOKEN

# LLM Provider (choose one mode)
npx wrangler secret put LLM_PROVIDER  # "openai-raw" (default), "ai-sdk", or "cloudflare-gateway"
npx wrangler secret put LLM_MODEL     # e.g. "gpt-4o-mini" or "anthropic/claude-sonnet-4"

# LLM API Keys (based on provider mode)
npx wrangler secret put OPENAI_API_KEY         # For openai-raw or ai-sdk with OpenAI
npx wrangler secret put OPENAI_BASE_URL        # Optional: override OpenAI base URL for openai-raw and ai-sdk (OpenAI models)
# npx wrangler secret put ANTHROPIC_API_KEY    # For ai-sdk with Anthropic
# npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY  # For ai-sdk with Google
# npx wrangler secret put XAI_API_KEY          # For ai-sdk with xAI/Grok
# npx wrangler secret put DEEPSEEK_API_KEY     # For ai-sdk with DeepSeek
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID  # For cloudflare-gateway
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_ID          # For cloudflare-gateway
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN       # For cloudflare-gateway

# Optional
npx wrangler secret put ALPACA_PAPER         # "true" for paper trading (recommended)
npx wrangler secret put TWITTER_BEARER_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put KILL_SWITCH_SECRET   # Emergency kill switch (separate from API token)
```

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Enable the agent

All API endpoints require authentication via Bearer token:

```bash
# Set your API token as an env var for convenience
export MAHORAGA_TOKEN="your-api-token"

# Enable the agent
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/enable
```

### 6. Monitor

```bash
# Check status
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/status

# View logs
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/logs

# Emergency kill switch (uses separate KILL_SWITCH_SECRET)
curl -H "Authorization: Bearer $KILL_SWITCH_SECRET" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/kill

# Run dashboard locally
cd dashboard && npm install && npm run dev
```

## Local Development

```bash
# Terminal 1 - Start wrangler
npx wrangler dev

# Terminal 2 - Start dashboard  
cd dashboard && npm run dev

# Terminal 3 - Enable the agent
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  http://localhost:8787/agent/enable
```

## Custom Strategies

Mahoraga uses a **pluggable strategy system**. The core harness is a thin orchestrator — all customizable logic lives in strategy modules. You never need to modify core files.

### How it works

1. Create `src/strategy/my-strategy/index.ts` implementing the `Strategy` interface
2. Change one import line in `src/strategy/index.ts`

```typescript
// src/strategy/index.ts
import { myStrategy } from "./my-strategy";
export const activeStrategy = myStrategy;
```

### What you can customize

| Component | File | What it does |
|-----------|------|--------------|
| **Gatherers** | `gatherers/*.ts` | Fetch signals from data sources (StockTwits, Reddit, etc.) |
| **Prompts** | `prompts/*.ts` | LLM prompt templates for research and analysis |
| **Entry rules** | `rules/entries.ts` | Decide which signals to buy |
| **Exit rules** | `rules/exits.ts` | Decide when to sell positions |
| **Config** | `config.ts` | Default parameters and source weights |

You can reuse default gatherers, mix in custom ones, override prompts, and define your own entry/exit rules — all without touching core files.

### Adding a new data source

Create a gatherer that returns `Signal[]`:

```typescript
import type { Gatherer, StrategyContext } from "../../types";

const myGatherer: Gatherer = {
  name: "my-source",
  gather: async (ctx: StrategyContext) => {
    const res = await fetch("https://your-api.com/data");
    const data = await res.json();
    return data.items.map(item => ({
      symbol: item.ticker,
      source: "my_source",
      source_detail: "my_source_v1",
      sentiment: item.sentiment,
      raw_sentiment: item.sentiment,
      volume: 1,
      freshness: 1.0,
      source_weight: 0.9,
      reason: `MySource: ${item.summary}`,
      timestamp: Date.now(),
    }));
  },
};
```

Then include it in your strategy's `gatherers` array.

See `docs/harness.html` for the full customization guide.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `max_positions` | 5 | Maximum concurrent positions |
| `max_position_value` | 5000 | Maximum $ per position |
| `take_profit_pct` | 10 | Take profit percentage |
| `stop_loss_pct` | 5 | Stop loss percentage |
| `min_sentiment_score` | 0.3 | Minimum sentiment to consider |
| `min_analyst_confidence` | 0.6 | Minimum LLM confidence to trade |
| `options_enabled` | false | Enable options trading |
| `crypto_enabled` | false | Enable 24/7 crypto trading |
| `llm_model` | gpt-4o-mini | Research model (cheap, for bulk analysis) |
| `llm_analyst_model` | gpt-4o | Analyst model (smart, for trading decisions) |

### LLM Provider Configuration

MAHORAGA supports multiple LLM providers via three modes:

| Mode | Description | Required Env Vars |
|------|-------------|-------------------|
| `openai-raw` | Direct OpenAI API (default) | `OPENAI_API_KEY` |
| `ai-sdk` | Vercel AI SDK with 5 providers | One or more provider keys |
| `cloudflare-gateway` | Cloudflare AI Gateway (/compat) | `CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, `CLOUDFLARE_AI_GATEWAY_TOKEN` |

**Optional OpenAI Base URL Override:**

- `OPENAI_BASE_URL` — Override the base URL used for OpenAI requests. Applies to `LLM_PROVIDER=openai-raw` and OpenAI models in `LLM_PROVIDER=ai-sdk` (models starting with `openai/`). Default: `https://api.openai.com/v1`.

**Cloudflare AI Gateway Notes:**

- This integration calls Cloudflare's OpenAI-compatible `/compat/chat/completions` endpoint and always sends `cf-aig-authorization`.
- It is intended for BYOK/Unified Billing setups where upstream provider keys are configured in Cloudflare (so your worker does not send provider API keys).
- Models use the `{provider}/{model}` format (e.g. `openai/gpt-5-mini`, `google-ai-studio/gemini-2.5-flash`, `anthropic/claude-sonnet-4-5`).

**AI SDK Supported Providers:**

| Provider | Env Var | Example Models |
|----------|---------|----------------|
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-4o`, `openai/o1` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-pro`, `google/gemini-2.5-flash` |
| xAI (Grok) | `XAI_API_KEY` | `xai/grok-4`, `xai/grok-3` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner` |

**Example: Using Claude with AI SDK:**

```bash
npx wrangler secret put LLM_PROVIDER      # Set to "ai-sdk"
npx wrangler secret put LLM_MODEL         # Set to "anthropic/claude-sonnet-4"
npx wrangler secret put ANTHROPIC_API_KEY # Your Anthropic API key
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/agent/status` | Full status (account, positions, signals) |
| `/agent/enable` | Enable the agent |
| `/agent/disable` | Disable the agent |
| `/agent/config` | Get or update configuration |
| `/agent/logs` | Get recent logs |
| `/agent/trigger` | Manually trigger (for testing) |
| `/agent/kill` | Emergency kill switch (uses `KILL_SWITCH_SECRET`) |
| `/mcp` | MCP server for tool access |

## Security

### API Authentication (Required)

All `/agent/*` endpoints require Bearer token authentication using `MAHORAGA_API_TOKEN`:

```bash
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" https://mahoraga.bernardoalmeida2004.workers.dev/agent/status
```

Generate a secure token: `openssl rand -base64 48`

### Emergency Kill Switch

The `/agent/kill` endpoint uses a separate `KILL_SWITCH_SECRET` for emergency shutdown:

```bash
curl -H "Authorization: Bearer $KILL_SWITCH_SECRET" https://mahoraga.bernardoalmeida2004.workers.dev/agent/kill
```

This immediately disables the agent, cancels all alarms, and clears the signal cache.

### Cloudflare Access (Recommended)

For additional security with SSO/email verification, set up Cloudflare Access:

```bash
# 1. Create a Cloudflare API token with Access:Edit permissions
#    https://dash.cloudflare.com/profile/api-tokens

# 2. Run the setup script
CLOUDFLARE_API_TOKEN=your-token \
CLOUDFLARE_ACCOUNT_ID=your-account-id \
MAHORAGA_WORKER_URL=https://mahoraga.your-subdomain.workers.dev \
MAHORAGA_ALLOWED_EMAILS=you@example.com \
npm run setup:access
```

This creates a Cloudflare Access Application with email verification or One-Time PIN.

## Project Structure

```
mahoraga/
├── wrangler.jsonc              # Cloudflare Workers config
├── src/
│   ├── index.ts                # Entry point & routing
│   ├── core/
│   │   ├── types.ts            # Shared types (Signal, AgentState, etc.)
│   │   └── policy-broker.ts    # PolicyEngine-wrapped trade execution
│   ├── durable-objects/
│   │   └── mahoraga-harness.ts # Core orchestrator (thin — delegates to strategy)
│   ├── strategy/
│   │   ├── types.ts            # Strategy interface contract
│   │   ├── index.ts            # Active strategy selector (change this one line)
│   │   └── default/            # Default "sentiment-momentum" strategy
│   │       ├── index.ts        # Strategy assembly
│   │       ├── config.ts       # Default config & source weights
│   │       ├── gatherers/      # StockTwits, Reddit, SEC, crypto, Twitter
│   │       ├── prompts/        # LLM prompt templates
│   │       ├── rules/          # Entry/exit/staleness/options/crypto rules
│   │       └── helpers/        # Ticker extraction, sentiment analysis
│   ├── mcp/                    # MCP server & tools
│   ├── policy/                 # Trade validation & risk engine
│   ├── providers/              # Alpaca, LLM providers
│   └── schemas/                # Config schemas (Zod)
├── dashboard/                  # React dashboard
├── docs/                       # Documentation
└── migrations/                 # D1 database migrations
```

## Safety Features

| Feature | Description |
|---------|-------------|
| Paper Trading | Start with `ALPACA_PAPER=true` |
| Kill Switch | Emergency halt via secret |
| Position Limits | Max positions and $ per position |
| Daily Loss Limit | Stops trading after 2% daily loss |
| Staleness Detection | Auto-exit stale positions |
| No Margin | Cash-only trading |
| No Shorting | Long positions only |

## Community

Join our Discord for help and discussion:

**[Discord Server](https://discord.gg/vMFnHe2YBh)**

## Disclaimer

**⚠️ IMPORTANT: READ BEFORE USING**

This software is provided for **educational and informational purposes only**. Nothing in this repository constitutes financial, investment, legal, or tax advice.

**By using this software, you acknowledge and agree that:**

- All trading and investment decisions are made **at your own risk**
- Markets are volatile and **you can lose some or all of your capital**
- No guarantees of performance, profits, or outcomes are made
- The authors and contributors are **not responsible** for any financial losses
- This software may contain bugs or behave unexpectedly
- Past performance does not guarantee future results

**Always start with paper trading and never risk money you cannot afford to lose.**

## License

MIT License - Free for personal and commercial use. See [LICENSE](LICENSE) for full terms.
