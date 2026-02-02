⚠️ **Warning:** This software is provided for educational and informational purposes only. Nothing in this repository constitutes financial, investment, legal, or tax advice.




# MAHORAGA

An autonomous, LLM-powered trading agent that adapts to social sentiment and makes trading decisions using AI.

[![Discord](https://img.shields.io/discord/1467592472158015553?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/Ys8KpsW5NN)

MAHORAGA scrapes StockTwits for trending stocks, uses OpenAI to analyze signals and research opportunities, then executes trades through Alpaca. It's designed as a starting point for building your own agentic trading strategies.

<img width="1278" height="957" alt="dashboard" src="https://github.com/user-attachments/assets/56473ab6-e2c6-45fc-9e32-cf85e69f1a2d" />


## Features

- **LLM-Powered Analysis** - OpenAI evaluates signals and decides what to buy/sell
- **24/7 Sentiment Monitoring** - Scrapes StockTwits trending stocks
- **Position Research** - AI continuously evaluates held positions
- **Automatic Risk Management** - Stop-loss, take-profit, position limits, kill switch
- **Real-Time Dashboard** - Monitor positions, signals, research, and costs
- **Paper Trading Mode** - Test safely before going live
- **MCP Server Architecture** - Extensible tool-based design
- **Cost Tracking** - Monitor your OpenAI spend in real-time

## Requirements

- Node.js 18+
- Alpaca account (free, paper trading supported)
- OpenAI API key (required for agentic features)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ygwyg/MAHORAGA.git
cd mahoraga
npm install
cd dashboard && npm install && cd ..
```

### 2. Configure API keys

Create a `.dev.vars` file in the project root:

```bash
ALPACA_API_KEY=your_alpaca_key
ALPACA_API_SECRET=your_alpaca_secret
ALPACA_PAPER=true
OPENAI_API_KEY=your_openai_key
KILL_SWITCH_SECRET=any_random_string_here
```

> **Important**: Always start with `ALPACA_PAPER=true` until you understand how the system works.

### 3. Initialize the database

```bash
npm run db:migrate
```

### 4. Start the MCP server

```bash
npm run dev
```

The server runs at `http://localhost:8787`

### 5. Start the trading agent

In a new terminal:

```bash
node agent-v1.mjs
```

### 6. Start the dashboard (optional)

In a new terminal:

```bash
cd dashboard
npm run dev
```

Open `http://localhost:5173` in your browser.

## Getting API Keys

### Alpaca (Required)

1. Create a free account at [alpaca.markets](https://alpaca.markets)
2. Go to **Paper Trading** > **API Keys**
3. Click **Generate New Keys**
4. Copy both the key and secret

> Start with paper trading. Switch to live only after thorough testing.

### OpenAI (Required)

The agent uses OpenAI for signal analysis and position management:

1. Create an account at [platform.openai.com](https://platform.openai.com)
2. Add billing and credits ($10 is plenty to start)
3. Go to **API Keys** > **Create new secret key**
4. Add to `.dev.vars`: `OPENAI_API_KEY=sk-your_key`

**Estimated costs**: ~$0.50-2/day depending on trading activity (using gpt-4o-mini)

## Configuration

Edit `agent-config.json` (created on first run) or use the dashboard:

| Setting | Default | Description |
|---------|---------|-------------|
| `max_positions` | 3 | Maximum stocks to hold at once |
| `max_position_value` | 2000 | Maximum $ per position |
| `take_profit_pct` | 8 | Auto-sell at this % profit |
| `stop_loss_pct` | 4 | Auto-sell at this % loss |
| `min_sentiment_score` | 0.3 | Minimum bullish sentiment to consider |
| `min_analyst_confidence` | 0.6 | Minimum LLM confidence to trade |
| `min_volume` | 10 | Minimum message volume to consider |
| `position_size_pct_of_cash` | 20 | Max % of cash per position |
| `llm_model` | gpt-4o-mini | OpenAI model for analysis |

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENT (agent-v1.mjs)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────────────────────┐    │
│  │   StockTwits    │     │       LLM Analysis (OpenAI)     │    │
│  │   Sentiment     │────▶│  • Signal research              │    │
│  │                 │     │  • Position management          │    │
│  └─────────────────┘     │  • Buy/sell decisions           │    │
│                          └──────────────┬──────────────────┘    │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER (Cloudflare Workers)              │
├─────────────────────────────────────────────────────────────────┤
│  Policy Engine → Approval Tokens → Order Execution              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Alpaca    │
                    │   Broker    │
                    └─────────────┘
```

### Agentic Loop

**Data Gathering (runs 24/7)**
- Fetches trending stocks from StockTwits
- Calculates sentiment score (bullish vs bearish messages)
- LLM researches top signals: analyzes if sentiment is real, looks for red flags

**Trading Loop (market hours only)**
- Checks existing positions against stop-loss/take-profit rules
- LLM analyzes each position: should we hold or sell?
- LLM evaluates buy opportunities from researched signals
- Executes trades through MCP server

### LLM Decision Making

The agent uses OpenAI for two key decisions:

**Signal Research** - For each trending stock:
```
Is the sentiment justified? Is it too late? Any red flags?
→ Returns: BUY / SKIP / WAIT with confidence score
```

**Position Analysis** - For each held position:
```
Is sentiment still supportive? Signs of exhaustion?
→ Returns: HOLD / SELL with reasoning
```

Only BUY signals with confidence >= `min_analyst_confidence` (default 0.6) are executed.

### Order Flow (Two-Step Safety)

All orders go through a two-step process:

1. **Preview** (`orders-preview`) - Validates against policy, returns approval token
2. **Submit** (`orders-submit`) - Executes with valid token

This prevents accidental trades and enforces risk limits.

## Safety Features

| Feature | Description |
|---------|-------------|
| Paper Trading | Default mode - no real money at risk |
| Kill Switch | Emergency halt for all trading |
| Position Limits | Max positions and $ per position |
| Daily Loss Limit | Stops trading after 2% daily loss |
| Cooldown Period | 30-minute pause after losses |
| Approval Tokens | Orders expire after 5 minutes |
| LLM Confidence Gate | Trades require minimum confidence |
| No Margin | Cash-only trading |
| No Shorting | Long positions only |

## Estimated Costs

### API Costs

| Service | Cost | Notes |
|---------|------|-------|
| StockTwits | Free | No API key required |
| Alpaca (paper) | Free | Practice trading |
| Alpaca (live) | Free | Commission-free stocks |
| OpenAI | ~$0.50-2/day | Using gpt-4o-mini |

The dashboard shows real-time LLM cost tracking.

## Project Structure

```
mahoraga/
├── agent-v1.mjs              # Trading agent - COPY AND MODIFY THIS
├── .dev.vars                 # API keys (DO NOT COMMIT)
├── agent-config.json         # Runtime config (DO NOT COMMIT)
├── agent-logs.json           # Activity logs (DO NOT COMMIT)
├── wrangler.toml             # Cloudflare Workers config
├── package.json
│
├── src/                      # MCP Server
│   ├── index.ts              # Entry point
│   ├── durable-objects/
│   │   └── trading-agent.ts  # DO version of agent (optional)
│   ├── mcp/
│   │   └── agent.ts          # MCP tool definitions
│   ├── policy/
│   │   ├── engine.ts         # Trade validation logic
│   │   ├── config.ts         # Policy configuration
│   │   └── approval.ts       # Token generation/validation
│   ├── providers/
│   │   ├── alpaca/           # Alpaca API client
│   │   ├── llm/              # OpenAI integration
│   │   └── technicals.ts     # Technical indicators
│   └── storage/
│       └── d1/               # Database queries
│
├── dashboard/                # React dashboard
│   ├── src/
│   │   ├── App.tsx           # Main dashboard
│   │   └── components/
│   └── package.json
│
└── migrations/               # Database migrations
```

## Troubleshooting

### "Failed to connect to MCP server"

Make sure the MCP server is running:
```bash
npm run dev
```

### "Invalid API key"

Check your `.dev.vars` file has correct Alpaca and OpenAI keys.

### "Market is closed"

The agent only trades during market hours (9:30 AM - 4:00 PM ET, Mon-Fri). It gathers data 24/7 but won't execute trades when markets are closed.

### Agent not making trades

1. Check `min_analyst_confidence` - LLM might not be confident enough (try 0.5)
2. Check `min_sentiment_score` - might be too high (try 0.2)
3. Check `max_positions` - might already be at limit
4. Check research results in dashboard - see what the LLM is thinking
5. Check logs in dashboard or `agent-logs.json`

### High OpenAI costs

1. Reduce polling frequency: increase `data_poll_interval_ms`
2. Use cheaper model: set `llm_model` to `gpt-4o-mini`
3. The dashboard shows real-time cost tracking

## Extending the Agent

**Copy `agent-v1.mjs` and modify it.** The file has clearly marked sections:

```
┌─────────────────────────────────────────────────────────────────┐
│  SECTION 1: DATA SOURCE (customize this)                        │
│  - StockTwitsAgent class                                        │
│  - Add your own: news APIs, custom signals, etc.                │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 2: TRADING STRATEGY (customize this)                   │
│  - runTradingLogic() method                                     │
│  - Change buy/sell rules, add technical indicators, etc.        │
├─────────────────────────────────────────────────────────────────┤
│  SECTION 3: HARNESS (probably don't touch)                      │
│  - MCP connection, execution, dashboard API                     │
│  - Modify only if you know what you're doing                    │
└─────────────────────────────────────────────────────────────────┘
```

### Available MCP Tools

The MCP server provides these tools for your agents:

| Tool | Description |
|------|-------------|
| `accounts-get` | Get account balance and status |
| `positions-list` | List current positions |
| `positions-close` | Close a position |
| `orders-preview` | Preview order and get approval token |
| `orders-submit` | Submit approved order |
| `orders-list` | List recent orders |
| `market-clock` | Check if market is open |
| `market-quote` | Get stock quote |
| `technicals-get` | Get technical indicators (RSI, MACD, etc.) |
| `catalog-list` | List all available tools |

### Ideas for Extension

1. **Add more data sources**: News APIs, SEC filings, custom signals
2. **Enhance LLM prompts**: Add technical analysis, fundamentals, news context
3. **Multi-source confirmation**: Require 2+ sources to agree before trading
4. **Options trading**: The MCP server supports options via Alpaca
5. **Custom indicators**: Use the `technicals-get` MCP tool

## Community

Join our Discord for help, discussion, and sharing strategies:

**[Discord Server](https://discord.gg/Ys8KpsW5NN)**

## Disclaimer

**⚠️ IMPORTANT: READ BEFORE USING**

This software is provided for **educational and informational purposes only**. Nothing in this repository constitutes financial, investment, legal, or tax advice.

**By using this software, you acknowledge and agree that:**

- All trading and investment decisions are made **at your own risk**
- Markets are volatile and **you can lose some or all of your capital**
- No guarantees of performance, profits, or outcomes are made
- The authors, contributors, and maintainers are **not responsible** for any financial losses, damages, or other consequences resulting from the use of this software
- You are **solely responsible** for your own trades and investment decisions
- This software may contain bugs, errors, or behave unexpectedly
- Past performance (real or simulated) does not guarantee future results

**If you do not fully understand the risks involved in trading or investing, you should not use this software.**

No member, contributor, or operator of this project shall be held liable for losses of any kind. This software is provided "as is" without warranty of any kind, express or implied.

**Always start with paper trading (`ALPACA_PAPER=true`) and never risk money you cannot afford to lose.**

## License

MIT License - Free for personal and commercial use. See [LICENSE](LICENSE) for full terms.
