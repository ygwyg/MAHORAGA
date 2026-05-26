# MAHORAGA - How the Agent Works

## What Is This?

MAHORAGA is a **fully autonomous AI-powered stock trading agent** that runs 24/7 on Cloudflare Workers. It monitors social media sentiment (Reddit, StockTwits, Twitter), SEC filings, and crypto markets, uses LLMs to research and decide on trades, and executes them through Alpaca's brokerage API - all without human intervention.

Think of it as a Wall Street analyst, research team, and trader - all rolled into one AI system that never sleeps.

---

## Architecture Overview

```
                         +------------------+
                         |   Cloudflare     |
                         |   Workers Edge   |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
              +-----v------+           +-------v--------+
              | HTTP Router|           | Cron Scheduler  |
              | (index.ts) |           | (5 schedules)   |
              +-----+------+           +-------+--------+
                    |                           |
         +----------+----------+                |
         |          |          |                |
    +----v---+ +---v----+ +---v---+            |
    |/health | |/agent/*| | /mcp  |            |
    |/       | |        | |       |            |
    +--------+ +---+----+ +-------+            |
                   |                            |
            +------v----------------------------v------+
            |          MAHORAGA HARNESS                 |
            |      (Durable Object - 3,400+ lines)     |
            |                                          |
            |  +--------+  +---------+  +-----------+  |
            |  | Signal  |  |  LLM    |  | Trading   |  |
            |  | Cache   |  | Engine  |  | Executor  |  |
            |  +--------+  +---------+  +-----------+  |
            |                                          |
            +--+--------+--------+--------+------------+
               |        |        |        |
          +----v--+ +---v---+ +-v----+ +-v--------+
          |Alpaca | |LLM    | | D1   | | KV Cache |
          |Broker | |Provdr | | (DB) | |          |
          +-------+ +-------+ +------+ +----------+
```

---

## The Autonomous Loop (The Heart of MAHORAGA)

When you enable the agent, it starts a **30-second alarm loop** using Cloudflare Durable Object alarms. Every 30 seconds, it wakes up and runs through this cycle:

### Step 1: Data Gathering (Every 30 seconds)

Four data sources are polled **in parallel**:

**StockTwits** - Fetches trending symbols and their message sentiment
- Gets 30 messages per trending symbol
- Calculates weighted sentiment from Bullish/Bearish tags
- Applies time decay (older posts matter less)
- Requires 5+ messages per symbol for a valid signal

**Reddit** - Scrapes 4 subreddits hot feeds
- r/wallstreetbets (weight: 0.6 - lower trust, lots of noise)
- r/stocks (weight: 0.9 - higher quality)
- r/investing (weight: 0.8)
- r/options (weight: 0.85)
- Extracts ticker symbols from post titles
- Scores based on: engagement (upvotes, comments) x flair quality x time decay x source weight
- Flair scoring: "DD" posts get 1.5x, "Meme" gets 0.4x, "Shitpost" gets 0.3x

**Crypto** - Monitors BTC/USD, ETH/USD, SOL/USD
- Calculates 24h momentum from price vs previous close
- Triggers signals on +/-2% moves

**SEC EDGAR** - Polls latest 8-K and Form 4 filings
- 8-K filings (material events) weighted at 0.95
- Form 4 (insider trades) weighted at 0.9
- Resolves company names to tradeable ticker symbols

All signals are **merged into a cache** (max 200 signals, 24h max age), sorted by absolute sentiment strength.

### Step 2: LLM Research (Every 2 minutes)

The agent takes the **top 5 strongest signals** (that it doesn't already hold) and asks an LLM:

> "Given this social sentiment data and current price, should we BUY this stock?"

The LLM returns structured JSON:
```json
{
  "verdict": "BUY",        // BUY, SKIP, or WAIT
  "confidence": 0.78,      // 0-1 scale
  "entry_quality": "good", // excellent, good, fair, poor
  "reasoning": "Strong DD posts with insider buying confirmation...",
  "red_flags": ["Low volume", "Earnings next week"],
  "catalysts": ["Patent approval", "Insider buying cluster"]
}
```

Research results are cached for 3 minutes per symbol. Costs are tracked per call.

### Step 3: Pre-Market Analysis (Before 9:30 AM ET)

Before market open, the agent runs a **strategic planning session** with the LLM, looking at:
- Overnight signals and research
- Current positions
- Market conditions
- Creates a plan for market open execution

### Step 4: Trading Decisions (Every 2 minutes during market hours 9:30 AM - 4 PM ET)

The **Analyst** runs every 2 minutes and makes two types of decisions:

#### Exit Decisions (checked first)
For each open position, check:

1. **Take Profit**: Has it hit the profit target? (default: +10%)
2. **Stop Loss**: Has it hit the loss limit? (default: -5%)
3. **Staleness**: Is the position going nowhere?

The staleness system uses a 100-point score:
- **Time score (0-40 pts)**: How long held vs max hold days (default 3 days)
- **Price action (0-30 pts)**: Losses penalized 3x, small gains penalized
- **Social decay (0-30 pts)**: Has social buzz died compared to entry?
- Score >= 70 triggers an exit

#### Entry Decisions
1. Filter researched signals with `verdict == "BUY"` and confidence >= 0.6
2. Optionally boost confidence by +15% if Twitter confirms the signal
3. Size the position: `min(cash * 25% * confidence, $5,000 max)`
4. Validate: minimum $100, not OTC, correct exchange
5. Execute market order through Alpaca

### Step 5: Reschedule

The alarm reschedules itself for 30 seconds later. The cycle never stops until you disable the agent.

---

## Integrations

### Alpaca (Brokerage) - REQUIRED
The actual trading broker. Handles:
- Account info (equity, cash, buying power)
- Position management (open, close, list)
- Order execution (market, limit, stop, trailing stop)
- Market data (bars, quotes, snapshots)
- Options contracts and Greeks
- Market clock and calendar
- Supports both **paper trading** (fake money) and **live trading** (real money)

### LLM Providers - REQUIRED (pick one)

Three provider modes with access to 7+ AI model families:

| Provider Mode | Models Available | Key |
|---|---|---|
| `openai-raw` (default) | GPT-4o, GPT-4o-mini, GPT-5.2, o1 | `OPENAI_API_KEY` |
| `ai-sdk` | OpenAI, Claude, Gemini, Grok, DeepSeek | Multiple keys |
| `cloudflare-gateway` | Any via Cloudflare proxy | Gateway credentials |

The agent uses **two LLM roles**:
- **Research Model** (`llm_model`): Quick research on signals (default: gpt-4o-mini)
- **Analyst Model** (`llm_analyst_model`): Deep trading decisions (default: gpt-4o)

### StockTwits - Built-in (no auth needed)
Public API for retail trader sentiment. Fetches trending symbols and message streams.

### Reddit - Built-in (no auth needed)
Scrapes public JSON feeds from 4 financial subreddits. Extracts tickers, sentiment, and engagement metrics.

### SEC EDGAR - Built-in (no auth needed)
Polls the SEC's public EDGAR system for material event filings and insider trades.

### Twitter/X - OPTIONAL
Used for **confirmation only** (not primary signals):
- Searches for cashtag mentions with actionable keywords
- Weighted by author followers and engagement
- Budget: 200 reads/day
- Monitors breaking news accounts (FirstSquawk, DeItaone)
- Can boost or reduce confidence by up to 15%

### Discord - OPTIONAL
Sends webhook notifications for:
- Trade executions (buys and sells)
- High-conviction signals
- Breaking news
- Kill switch activation

### Cloudflare Services - Infrastructure

| Service | Purpose |
|---|---|
| Workers | Runtime (the server) |
| Durable Objects | Stateful agent brain + session management |
| D1 (SQLite) | Trades, events, risk state, trade journal, memory |
| KV | Cache for quotes, technicals, news (30s - 24h TTL) |
| R2 | Object storage for reports and raw events (not yet enabled) |

---

## The Dashboard

A React 19 + Tailwind CSS single-page application with a cyberpunk HUD design.

### What It Shows
- **Account Panel**: Equity, cash, buying power, total P&L
- **Positions Table**: Every open position with qty, value, P&L, sparkline charts
- **LLM Costs**: Total spend, API calls, tokens, average cost per call
- **Portfolio Performance**: Line chart with market hour zone overlays
- **Position Performance**: Multi-line chart showing % change per position
- **Active Signals**: Scrollable list of current market signals with tooltips
- **Activity Feed**: Live log stream from the agent
- **Signal Research**: LLM research results (verdict, confidence, catalysts, red flags)
- **Notification Bell**: Shows overnight activity summary

### How It Connects
- Polls `GET /agent/status` every 5 seconds
- Authenticates with Bearer token stored in localStorage
- Can update config through Settings modal
- Setup Wizard for first-time configuration

---

## Safety Systems

### Kill Switch
A separate secret (`KILL_SWITCH_SECRET`) that immediately:
- Disables the agent
- Cancels all alarms
- Clears signal cache and research
- Does NOT auto-close positions (deliberate design choice)

### Policy Engine
Validates every trade against rules:
- Max position size (% of equity)
- Max notional per trade ($5,000 default)
- Daily loss limit (2% of equity)
- Cooldown period after hitting loss limit (30 min)
- Symbol deny/allow lists
- Exchange restrictions (NYSE, NASDAQ, etc. only)
- Market hours enforcement

### Risk Controls in the Agent
- Maximum 5 concurrent positions
- Minimum sentiment score of 0.3
- Minimum analyst confidence of 0.6
- Stale position auto-exit after 3 days
- OTC stock blocking
- Ticker validation against SEC company list
- Constant-time token comparison (prevents timing attacks)

---

## Data Flow Summary

```
Social Media (StockTwits, Reddit, Twitter)
SEC EDGAR Filings
Crypto Price Snapshots
         |
         v
  [ Signal Cache (200 max, 24h decay) ]
         |
         v
  [ LLM Research: BUY / SKIP / WAIT ]
         |
         v
  [ Analyst Decision Loop ]
    - Exit checks (profit, loss, staleness)
    - Entry checks (confidence, Twitter confirmation)
         |
         v
  [ Alpaca Order Execution ]
         |
         v
  [ D1 Database: Trade log, Journal, Risk state ]
         |
         v
  [ Dashboard: Real-time monitoring ]
  [ Discord: Notifications ]
```

---

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `src/index.ts` | ~120 | HTTP router, auth, CORS |
| `src/durable-objects/mahoraga-harness.ts` | ~3,450 | The entire autonomous agent |
| `src/mcp/agent.ts` | ~2,130 | MCP protocol server (40+ tools) |
| `src/providers/alpaca/` | Multiple | Alpaca broker integration |
| `src/providers/llm/factory.ts` | ~120 | Multi-provider LLM factory |
| `src/providers/social/stocktwits.ts` | | StockTwits API client |
| `src/providers/news/sec-edgar.ts` | | SEC EDGAR polling |
| `src/providers/technicals.ts` | | Technical indicators (RSI, MACD, etc.) |
| `src/policy/engine.ts` | | Trade validation rules |
| `src/storage/d1/` | | Database queries (12 tables) |
| `src/storage/kv/keys.ts` | | Cache key patterns and TTLs |
| `src/jobs/cron.ts` | ~135 | 5 scheduled jobs |
| `dashboard/src/App.tsx` | | Dashboard UI |
| `wrangler.jsonc` | ~96 | Cloudflare deployment config |

---

## MCP (Model Context Protocol) Server

MAHORAGA also exposes an MCP server at `/mcp` with 40+ tools organized into categories:

- **Auth**: Verify credentials, get system config
- **Account**: Get account info, portfolio history
- **Positions**: List, close positions
- **Orders**: Preview (with policy check) -> Submit (2-step approval flow)
- **Risk**: Kill switch, daily loss tracking, cooldown status
- **Memory**: Log trades, outcomes, query learned rules
- **Market Data**: Bars, quotes, snapshots, movers
- **Technicals**: RSI, MACD, Bollinger Bands, signals
- **Events**: Ingest, classify (LLM-powered), list
- **News**: Fetch, index articles
- **Research**: LLM-powered symbol research reports
- **Options**: Expirations, chains, snapshots, Greeks
- **Web Scrape**: Scrape whitelisted financial domains

This means you can also interact with MAHORAGA through any MCP-compatible client (like Claude Desktop) for manual research and trading.
