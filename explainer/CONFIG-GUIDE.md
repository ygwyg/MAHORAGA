# MAHORAGA - Complete Configuration Guide

A beginner-friendly guide to every configuration option, what it means, and how to get MAHORAGA trading for you.

---

## Table of Contents
1. [Concepts You Need to Know](#concepts-you-need-to-know)
2. [The Three Layers of Configuration](#the-three-layers-of-configuration)
3. [Layer 1: Infrastructure (wrangler.jsonc)](#layer-1-infrastructure-wranglerjosnc)
4. [Layer 2: Secrets (Environment Variables)](#layer-2-secrets)
5. [Layer 3: Agent Config (Runtime)](#layer-3-agent-config)
6. [Source Weighting (How Signals Are Scored)](#source-weighting)
7. [Policy Engine (Trade Guardrails)](#policy-engine)
8. [Step-by-Step: Getting Started](#step-by-step-getting-started)
9. [Tuning Your Strategy](#tuning-your-strategy)
10. [Common Scenarios](#common-scenarios)

---

## Concepts You Need to Know

Before diving into config, here are the key concepts:

### What is a "Signal"?
A signal is a piece of market intelligence from a data source. Examples:
- "AAPL was mentioned 50 times on r/wallstreetbets with bullish sentiment"
- "An SEC 8-K filing was just submitted for TSLA"
- "StockTwits shows 80% bullish sentiment for NVDA"

Each signal has a **sentiment score** from -1 (very bearish) to +1 (very bullish).

### What is "Confidence"?
After the LLM researches a signal, it assigns a **confidence score** from 0 to 1. This represents how sure the AI is that the trade will work:
- 0.0 - 0.3: Very uncertain (SKIP)
- 0.3 - 0.6: Somewhat interested (WAIT or marginal)
- 0.6 - 0.8: Confident enough to trade (BUY territory)
- 0.8 - 1.0: Very high conviction (may trigger options trades too)

### What is "Paper Trading"?
Paper trading uses fake money ($100k virtual dollars) to simulate real trading. Everything works exactly like real trading - same prices, same execution - but no real money is at risk. **Always start with paper trading.**

### What is a "Durable Object"?
A Cloudflare feature that gives your worker persistent memory and state. MAHORAGA's brain lives in a Durable Object - it remembers positions, signals, and config even when the worker restarts.

### What is "Time Decay"?
Old information matters less than new information. A Reddit post from 5 minutes ago is very relevant. The same post from 4 hours ago is much less relevant. MAHORAGA uses exponential decay with a 2-hour half-life:
- Just posted: 100% weight
- 2 hours old: 50% weight
- 4 hours old: 25% weight
- 8 hours old: ~6% weight (minimum 20%)

### What are "Stale Positions"?
A position that isn't going anywhere. If you bought a stock 3 days ago and it's barely moved while social buzz has died, it's probably not going to work out. MAHORAGA can automatically exit these.

---

## The Three Layers of Configuration

MAHORAGA has three layers of config, each controlling different things:

```
Layer 1: wrangler.jsonc       (Infrastructure - rarely changes)
  |
  v
Layer 2: Secrets               (API keys - set once)
  |
  v
Layer 3: Agent Config          (Strategy tuning - change anytime)
```

---

## Layer 1: Infrastructure (wrangler.jsonc)

This file tells Cloudflare how to run your worker. You rarely need to change it.

### Environment Variables (vars section)

```jsonc
{
  "vars": {
    "ENVIRONMENT": "production",
```
**ENVIRONMENT** - Which environment mode. Always "production" for deployed workers.

```jsonc
    "FEATURE_LLM_RESEARCH": "true",
```
**FEATURE_LLM_RESEARCH** - Master switch for AI research features. Set to `"false"` to disable all LLM calls (the agent will still gather signals but won't research or trade on them). Useful if you want to monitor signals without spending on API calls.

```jsonc
    "FEATURE_OPTIONS": "true",
```
**FEATURE_OPTIONS** - Master switch for options trading support. Even if `"true"`, options still need to be enabled in Agent Config separately.

```jsonc
    "DEFAULT_MAX_POSITION_PCT": "0.10",
```
**DEFAULT_MAX_POSITION_PCT** - Maximum single position as fraction of total equity. `0.10` = 10%.

**Example**: If your account has $100,000 equity, no single position can exceed $10,000.

```jsonc
    "DEFAULT_MAX_NOTIONAL_PER_TRADE": "5000",
```
**DEFAULT_MAX_NOTIONAL_PER_TRADE** - Maximum dollar amount per trade.

**Example**: Even if your 10% rule allows $10,000, this caps any single trade at $5,000.

```jsonc
    "DEFAULT_MAX_DAILY_LOSS_PCT": "0.02",
```
**DEFAULT_MAX_DAILY_LOSS_PCT** - Maximum daily loss before the agent pauses. `0.02` = 2%.

**Example**: With $100k equity, if you lose $2,000 in a day, the agent stops trading and enters a cooldown.

```jsonc
    "DEFAULT_COOLDOWN_MINUTES": "30",
```
**DEFAULT_COOLDOWN_MINUTES** - How long to pause after hitting the daily loss limit.

**Example**: Agent loses 2% in a day -> pauses for 30 minutes -> resumes trading.

```jsonc
    "DEFAULT_MAX_OPEN_POSITIONS": "10",
```
**DEFAULT_MAX_OPEN_POSITIONS** - Maximum simultaneous positions (policy-level cap).

```jsonc
    "DEFAULT_APPROVAL_TTL_SECONDS": "300"
```
**DEFAULT_APPROVAL_TTL_SECONDS** - How long a trade approval token is valid (for MCP manual trades). 300 = 5 minutes.

### Cloudflare Bindings

```jsonc
  "d1_databases": [{ "binding": "DB", "database_id": "..." }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "..." }],
```
- **DB**: The D1 SQLite database storing trades, events, risk state, and memory
- **CACHE**: KV namespace for caching market data (quotes, technicals, etc.)

### Cron Schedules

```jsonc
  "triggers": {
    "crons": [
      "*/5 13-20 * * 1-5",    // Every 5 min, 1-8 PM UTC, weekdays
      "0 14 * * 1-5",          // 2 PM UTC daily (market open prep)
      "30 21 * * 1-5",         // 9:30 PM UTC (market close cleanup)
      "0 5 * * *",             // 5 AM UTC daily (midnight reset)
      "0 * * * *"              // Every hour (cache refresh)
    ]
  }
```

These are supplementary scheduled jobs for housekeeping. The main trading loop runs via Durable Object alarms, NOT cron.

---

## Layer 2: Secrets

Secrets are sensitive values set via the command line. They're encrypted and never visible in your code.

### How to Set a Secret
```bash
npx wrangler secret put SECRET_NAME
# Then paste the value when prompted
```

### Required Secrets

| Secret | What It Is | Example |
|---|---|---|
| `ALPACA_API_KEY` | Your Alpaca brokerage API key | `PK1234ABCD5678` |
| `ALPACA_API_SECRET` | Your Alpaca API secret | `abc123def456...` |
| `MAHORAGA_API_TOKEN` | Password for the dashboard and API | Any strong random string |
| `KILL_SWITCH_SECRET` | Emergency stop password (keep separate!) | Different strong random string |
| `LLM_PROVIDER` | Which AI provider to use | `openai-raw` |
| `LLM_MODEL` | Which AI model | `gpt-4o-mini` |
| `OPENAI_API_KEY` | Your OpenAI (or Azure) API key | `sk-...` |

### How to Get an Alpaca API Key

1. Go to [alpaca.markets](https://alpaca.markets) and create an account
2. In the dashboard, go to "Paper Trading" (top right)
3. Click "View API Keys"
4. Generate a new key pair
5. Copy both the Key and Secret

**Important**: Start with Paper Trading! The `ALPACA_PAPER` secret controls this.

### Optional Secrets

| Secret | What It Is | When to Use |
|---|---|---|
| `ALPACA_PAPER` | Set to `"true"` for paper trading | Always for testing |
| `OPENAI_BASE_URL` | Override OpenAI endpoint URL | If using Azure OpenAI |
| `TWITTER_BEARER_TOKEN` | Twitter API access | For tweet-based confirmation |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook | For trade notifications |
| `ANTHROPIC_API_KEY` | Anthropic API key | If using Claude as LLM |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI key | If using Gemini |
| `XAI_API_KEY` | xAI API key | If using Grok |
| `DEEPSEEK_API_KEY` | DeepSeek API key | If using DeepSeek |

### LLM Provider Examples

**Using OpenAI directly (simplest):**
```bash
wrangler secret put LLM_PROVIDER    # Enter: openai-raw
wrangler secret put LLM_MODEL       # Enter: gpt-4o-mini
wrangler secret put OPENAI_API_KEY  # Enter: sk-...
```

**Using Azure OpenAI:**
```bash
wrangler secret put LLM_PROVIDER    # Enter: openai-raw
wrangler secret put LLM_MODEL       # Enter: gpt-4o
wrangler secret put OPENAI_API_KEY  # Enter: your-azure-key
wrangler secret put OPENAI_BASE_URL # Enter: https://your-resource.openai.azure.com/openai/v1
```

**Using Claude via Vercel AI SDK:**
```bash
wrangler secret put LLM_PROVIDER     # Enter: ai-sdk
wrangler secret put LLM_MODEL        # Enter: anthropic/claude-sonnet-4
wrangler secret put ANTHROPIC_API_KEY # Enter: sk-ant-...
```

**Using Cloudflare AI Gateway:**
```bash
wrangler secret put LLM_PROVIDER                    # Enter: cloudflare-gateway
wrangler secret put LLM_MODEL                        # Enter: openai/gpt-4o
wrangler secret put CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID # Enter: your-account-id
wrangler secret put CLOUDFLARE_AI_GATEWAY_ID         # Enter: your-gateway-id
wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN      # Enter: your-token
```

---

## Layer 3: Agent Config (Runtime)

This is where the trading strategy lives. You can change these **at any time** without redeploying, via:

```bash
curl -X POST https://your-worker.workers.dev/agent/config \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "take_profit_pct": 15 }'
```

Or through the dashboard Settings modal.

### Data Gathering

#### `data_poll_interval_ms` (default: 30000)
How often the agent checks for new signals, in milliseconds.

| Value | Meaning |
|---|---|
| 5000 | Every 5 seconds (aggressive, may hit rate limits) |
| **30000** | **Every 30 seconds (recommended)** |
| 60000 | Every minute (conservative) |
| 300000 | Every 5 minutes (very slow) |

**Example**: At 30000ms, the agent checks StockTwits, Reddit, SEC, and crypto data 120 times per hour.

#### `analyst_interval_ms` (default: 120000)
How often the AI analyst runs to make trading decisions.

| Value | Meaning |
|---|---|
| 30000 | Every 30 seconds (very aggressive, expensive LLM costs) |
| **120000** | **Every 2 minutes (recommended)** |
| 300000 | Every 5 minutes (conservative, cheaper) |
| 600000 | Every 10 minutes (very conservative) |

**Example**: At 120000ms, the agent makes trading decisions 30 times per hour during market hours.

### Position Management

#### `max_position_value` (default: 5000)
Maximum dollar value per position.

**Example**:
- Set to `5000`: Each trade maxes out at $5,000
- Set to `1000`: Conservative, smaller positions
- Set to `10000`: Larger bets (more risk, more reward)

#### `max_positions` (default: 5)
Maximum number of stocks you can hold simultaneously.

**Example**:
- Set to `3`: Very focused portfolio (3 stocks max)
- Set to `5`: Balanced (recommended for paper trading)
- Set to `10`: More diversified but more to manage

#### `position_size_pct_of_cash` (default: 25)
What percentage of available cash to use per trade.

The actual position size formula is:
```
size = min(cash * (position_size_pct / 100) * confidence, max_position_value)
```

**Example**: With $50k cash, 25% setting, and 0.7 confidence:
```
size = min($50,000 * 0.25 * 0.7, $5,000) = min($8,750, $5,000) = $5,000
```

### Entry Filters

#### `min_sentiment_score` (default: 0.3)
Minimum sentiment score for a signal to be considered. Range: 0 to 1.

| Value | Meaning |
|---|---|
| 0.1 | Very loose - considers weak signals (more trades, lower quality) |
| **0.3** | **Moderate filter (recommended)** |
| 0.5 | Strict - only strong signals (fewer trades, higher quality) |
| 0.7 | Very strict - only obvious momentum plays |

**Example**: A stock with 0.25 sentiment would be filtered out at the 0.3 threshold. It needs stronger buzz to be considered.

#### `min_analyst_confidence` (default: 0.6)
Minimum LLM confidence to actually place a trade. Range: 0 to 1.

| Value | Meaning |
|---|---|
| 0.4 | Low bar - trades on moderate conviction |
| **0.6** | **Standard (recommended)** |
| 0.7 | Higher bar - fewer but higher quality trades |
| 0.8 | Very selective - only highest conviction |

**Example**: The LLM researches AAPL and returns confidence 0.55. At the 0.6 threshold, this trade is **skipped**. At 0.5 threshold, it would execute.

### Exit Rules

#### `take_profit_pct` (default: 10)
Sell when the position gains this percentage.

| Value | Style |
|---|---|
| 5 | Quick scalps (fast exits, smaller gains) |
| **10** | **Swing trading (recommended)** |
| 20 | Position trading (bigger moves, longer holds) |
| 50 | Very long holds |

**Example**: Buy AAPL at $200. With `take_profit_pct: 10`, it sells at $220 (+10%).

#### `stop_loss_pct` (default: 5)
Sell when the position loses this percentage.

| Value | Style |
|---|---|
| 2 | Very tight stops (many stops triggered, protects capital) |
| 3 | Tight (day trading style) |
| **5** | **Standard (recommended)** |
| 10 | Wide stops (gives positions room to breathe) |

**Example**: Buy AAPL at $200. With `stop_loss_pct: 5`, it sells at $190 (-5%).

**Important**: Your reward:risk ratio is `take_profit_pct / stop_loss_pct`. The default 10/5 = 2:1, meaning you need to be right only 34% of the time to break even.

### Stale Position Management

These settings control automatic exit from positions that aren't doing anything.

#### `stale_position_enabled` (default: true)
Turn staleness detection on or off.

#### `stale_min_hold_hours` (default: 24)
Minimum hours before checking staleness. Don't check too early - give positions time to work.

#### `stale_max_hold_days` (default: 3)
Maximum days to hold a position before forcing a review.

**Example**: Position held for 3 days with only +1% gain and social buzz dying -> auto-exit.

#### `stale_min_gain_pct` (default: 5)
If held past `max_hold_days`, the position needs at least this gain to stay open.

#### `stale_social_volume_decay` (default: 0.3)
If social buzz drops below 30% of what it was at entry, that's a staleness signal.

**Example**: When you bought, there were 50 mentions/hour on Reddit. Now there are only 10/hour. That's 20% of original volume, below the 30% threshold - staleness triggered.

### LLM Configuration

#### `llm_provider` (default: "openai-raw")
Which LLM backend to use. See [Layer 2](#layer-2-secrets) for setup.

#### `llm_model` (default: "gpt-4o-mini")
The "fast" model used for signal research. Cheaper, called frequently.

**Cost comparison** (approximate per research call):
- `gpt-4o-mini`: ~$0.001 per call
- `gpt-4o`: ~$0.01 per call
- `gpt-5.2`: ~$0.02+ per call

#### `llm_analyst_model` (default: "gpt-4o")
The "smart" model used for final trading decisions. More expensive, called less often.

#### `llm_min_hold_minutes` (default: 30)
Minimum time to hold a position before the LLM can recommend selling. Prevents panic exits.

### Options Trading

Options are **disabled by default**. Only enable if you understand options.

#### `options_enabled` (default: false)
Master switch for options trading.

#### `options_min_confidence` (default: 0.8)
Higher confidence required for options (they're riskier). 0.8 = only very high conviction.

#### `options_max_pct_per_trade` (default: 0.02)
Maximum 2% of account per options trade. Options can go to zero, so size conservatively.

#### `options_min_dte` / `options_max_dte` (default: 30 / 60)
Days to expiration range. 30-60 DTE avoids rapid theta decay while keeping costs reasonable.

**Example**: If today is January 1, the agent would look at options expiring between January 31 and March 2.

#### `options_target_delta` (default: 0.45)
How deep in-the-money to target. Delta approximates probability of profit.

| Delta | Meaning |
|---|---|
| 0.2 | Far out-of-the-money (cheap, low probability) |
| 0.3 | Slightly OTM (moderate risk/reward) |
| **0.45** | **Near the money (balanced)** |
| 0.7 | In-the-money (expensive, high probability) |

#### `options_stop_loss_pct` (default: 50)
Options stop loss is much wider (50% vs 5% for stocks) because options are inherently more volatile.

#### `options_take_profit_pct` (default: 100)
Target a 100% gain on options (double your money) since they're riskier.

### Crypto Trading

Crypto trades 24/7 (not limited to market hours).

#### `crypto_enabled` (default: false)
Master switch for crypto trading.

#### `crypto_symbols` (default: ["BTC/USD", "ETH/USD", "SOL/USD"])
Which crypto pairs to monitor.

#### `crypto_momentum_threshold` (default: 2.0)
Minimum 24-hour price change percentage to trigger a signal.

**Example**: BTC moves +2.5% in 24 hours -> triggers a bullish signal. BTC moves -3% -> triggers a bearish signal. A +1.5% move would be ignored (below 2% threshold).

#### `crypto_max_position_value` (default: 1000)
Maximum $1,000 per crypto position (much smaller than stocks by default).

### Filtering

#### `ticker_blacklist` (default: [])
Symbols the agent will never trade.

**Example**: `["GME", "AMC", "BBBY"]` - Ignore meme stocks even if signals are strong.

#### `allowed_exchanges` (default: ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"])
Only trade stocks on these exchanges. Blocks OTC/pink sheet stocks.

---

## Source Weighting

These are hardcoded in the agent (not runtime configurable yet) but important to understand.

### How Trust Scores Work

Each data source has a **base weight** from 0 to 1:

```
Source                    Weight    Why
----                      ------    ---
SEC 8-K Filing            0.95      Official corporate filings = highest trust
Twitter FinTwit           0.95      Professional finance twitter
Twitter News              0.90      News accounts
Reddit r/stocks           0.90      Serious investors
StockTwits                0.85      Dedicated trading platform
Reddit r/options          0.85      Options-specific analysis
Reddit r/investing        0.80      Long-term investors
SEC 13F                   0.70      Fund holdings (delayed)
Reddit r/wallstreetbets   0.60      Lots of noise/memes
```

### Reddit Quality Multipliers

Reddit posts are further scored by their **flair** (post category):

| Flair | Multiplier | Reason |
|---|---|---|
| DD (Due Diligence) | 1.5x | Detailed research posts |
| Technical Analysis | 1.3x | Chart-based analysis |
| Fundamentals | 1.3x | Financial analysis |
| News | 1.2x | News sharing |
| Chart | 1.1x | Visual analysis |
| Discussion | 1.0x | Neutral |
| Daily Discussion | 0.7x | Low signal-to-noise |
| YOLO | 0.6x | Entertainment |
| Gain/Loss porn | 0.5x | Past trades, not signals |
| Meme | 0.4x | Jokes |
| Shitpost | 0.3x | Noise |

### Engagement Multipliers

Posts with more engagement are trusted more:

**Upvotes:**
- 1000+: 1.5x
- 500+: 1.3x
- 200+: 1.2x
- 100+: 1.1x
- 50+: 1.0x
- Under 50: 0.8x

**Comments:**
- 200+: 1.4x
- 100+: 1.25x
- 50+: 1.15x
- 20+: 1.05x
- Under 20: 0.9x

### Final Signal Score Formula

```
signal_quality = time_decay * engagement_multiplier * flair_multiplier * source_weight
```

**Example**: A r/stocks DD post with 300 upvotes and 80 comments, posted 1 hour ago:
```
time_decay = 0.5^(60/120) = 0.707
engagement = (1.2 upvotes * 1.15 comments) / 2 = ~1.17 (averaged)
flair = 1.5 (DD)
source = 0.9 (r/stocks)

quality = 0.707 * 1.17 * 1.5 * 0.9 = 1.12 (very strong signal)
```

---

## Policy Engine (Trade Guardrails)

The Policy Engine is a separate validation layer that blocks bad trades. Even if the AI says "BUY", the policy engine can reject it.

### What Gets Checked

Before every trade:
1. Is the kill switch active? -> Block all trades
2. Are we in a cooldown period? -> Block new entries
3. Does this exceed daily loss limit? -> Block
4. Does this exceed max position size? -> Block
5. Do we have too many open positions? -> Block
6. Is this symbol on the deny list? -> Block
7. Is this an allowed exchange? -> Block OTC
8. Is it market hours? (for stocks) -> Block after-hours
9. Is there enough buying power? -> Block

### Kill Switch

A separate emergency mechanism. When activated:
- All trading stops immediately
- Alarms are cancelled
- Signal cache is cleared
- **Existing positions are NOT closed** (so you can review manually)

Activate it:
```bash
curl -X POST https://your-worker.workers.dev/agent/kill \
  -H "Authorization: Bearer YOUR_KILL_SWITCH_SECRET"
```

---

## Step-by-Step: Getting Started

### Phase 1: Setup (30 minutes)

**1. Get Alpaca Paper Trading Account**
- Sign up at [alpaca.markets](https://alpaca.markets)
- Enable paper trading
- Generate API keys

**2. Get an LLM API Key**
- Sign up at [platform.openai.com](https://platform.openai.com)
- Generate an API key
- Add $10 credit (this will last a long time with gpt-4o-mini)

**3. Deploy the Worker**
```bash
# Clone the repo
git clone https://github.com/your-repo/mahoraga.git
cd mahoraga
npm install

# Run database migrations
npx wrangler d1 migrations apply mahoraga-db --remote

# Set required secrets
npx wrangler secret put ALPACA_API_KEY
npx wrangler secret put ALPACA_API_SECRET
npx wrangler secret put ALPACA_PAPER       # Enter: true
npx wrangler secret put MAHORAGA_API_TOKEN  # Make up a strong password
npx wrangler secret put KILL_SWITCH_SECRET  # Different strong password
npx wrangler secret put LLM_PROVIDER       # Enter: openai-raw
npx wrangler secret put LLM_MODEL          # Enter: gpt-4o-mini
npx wrangler secret put OPENAI_API_KEY     # Your OpenAI key

# Deploy
npx wrangler deploy
```

**4. Verify It Works**
```bash
# Check health
curl https://your-worker.workers.dev/health

# Check status (should return agent info)
curl https://your-worker.workers.dev/agent/status \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Phase 2: Conservative Start (Week 1)

**5. Set Conservative Config**
```bash
curl -X POST https://your-worker.workers.dev/agent/config \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "max_position_value": 1000,
    "max_positions": 3,
    "min_sentiment_score": 0.5,
    "min_analyst_confidence": 0.7,
    "take_profit_pct": 8,
    "stop_loss_pct": 3,
    "position_size_pct_of_cash": 15
  }'
```

This means: max $1k per trade, max 3 stocks, only strong signals, higher AI confidence required.

**6. Enable the Agent**
```bash
curl -X POST https://your-worker.workers.dev/agent/enable \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**7. Monitor Daily**
- Check the dashboard
- Review the activity feed
- Check LLM costs
- Watch how signals get scored and filtered

### Phase 3: Tune and Expand (Week 2+)

**8. Review Performance**
- Are positions hitting take profit or stop loss more often?
- Is the agent entering good trades?
- Are the LLM research verdicts accurate?

**9. Adjust Gradually**
- If too few trades: lower `min_sentiment_score` or `min_analyst_confidence`
- If too many losses: raise `min_analyst_confidence`, tighten `stop_loss_pct`
- If missing big moves: raise `take_profit_pct`, raise `max_position_value`

**10. Add Optional Features**
```bash
# Add Discord notifications
npx wrangler secret put DISCORD_WEBHOOK_URL

# Add Twitter confirmation
npx wrangler secret put TWITTER_BEARER_TOKEN

# Enable crypto (via config)
curl -X POST .../agent/config -d '{"crypto_enabled": true}'
```

### Phase 4: Going Live (When Ready)

**Only after weeks of profitable paper trading!**

```bash
# Switch from paper to live
npx wrangler secret put ALPACA_PAPER  # Enter: false
# (You'll need live Alpaca API keys)

# Start with tiny positions
curl -X POST .../agent/config -d '{
  "max_position_value": 500,
  "max_positions": 2,
  "min_analyst_confidence": 0.75
}'
```

---

## Tuning Your Strategy

### For More Trades (Higher Activity)
```json
{
  "min_sentiment_score": 0.2,
  "min_analyst_confidence": 0.5,
  "max_positions": 8,
  "analyst_interval_ms": 60000
}
```

### For Fewer, Higher Quality Trades
```json
{
  "min_sentiment_score": 0.5,
  "min_analyst_confidence": 0.75,
  "max_positions": 3,
  "analyst_interval_ms": 300000
}
```

### For Quick Scalping
```json
{
  "take_profit_pct": 3,
  "stop_loss_pct": 1.5,
  "stale_max_hold_days": 1,
  "stale_min_hold_hours": 4,
  "analyst_interval_ms": 60000
}
```

### For Swing Trading (Multi-Day Holds)
```json
{
  "take_profit_pct": 20,
  "stop_loss_pct": 8,
  "stale_max_hold_days": 7,
  "stale_min_hold_hours": 48,
  "analyst_interval_ms": 300000
}
```

### For Ultra-Conservative
```json
{
  "max_position_value": 500,
  "max_positions": 2,
  "min_sentiment_score": 0.6,
  "min_analyst_confidence": 0.8,
  "take_profit_pct": 5,
  "stop_loss_pct": 2,
  "position_size_pct_of_cash": 10
}
```

---

## Common Scenarios

### "The agent isn't making any trades"
Check in order:
1. Is the agent enabled? `GET /agent/status` - look for `enabled: true`
2. Is the market open? Check `clock.is_open`
3. Are there signals? `GET /agent/signals` - if empty, data gathering may be failing
4. Is `min_sentiment_score` too high? Try lowering to 0.2
5. Is `min_analyst_confidence` too high? Try lowering to 0.5
6. Check LLM costs - if $0, the LLM isn't being called (check API key)

### "The agent is losing money"
1. Tighten stop loss: `stop_loss_pct: 3` (cut losses faster)
2. Raise confidence: `min_analyst_confidence: 0.75` (be more selective)
3. Reduce position size: `max_position_value: 1000`
4. Check which signals led to losses in the activity feed
5. Consider adding `ticker_blacklist` for symbols that keep losing

### "LLM costs are too high"
1. Use a cheaper model: `llm_model: "gpt-4o-mini"` (10x cheaper than gpt-4o)
2. Increase analyst interval: `analyst_interval_ms: 300000` (every 5 min instead of 2)
3. Raise sentiment filter: `min_sentiment_score: 0.5` (fewer signals to research)

### "I want to stop everything RIGHT NOW"
```bash
# Kill switch (separate from disable)
curl -X POST https://your-worker.workers.dev/agent/kill \
  -H "Authorization: Bearer YOUR_KILL_SWITCH_SECRET"
```

Then manually close any positions you want through Alpaca's dashboard.

### "How do I check what the agent is thinking?"
```bash
# Get full status with all internal state
curl https://your-worker.workers.dev/agent/status \
  -H "Authorization: Bearer YOUR_API_TOKEN" | jq .

# Just the signals
curl https://your-worker.workers.dev/agent/signals \
  -H "Authorization: Bearer YOUR_API_TOKEN" | jq .

# Activity log
curl https://your-worker.workers.dev/agent/logs?limit=50 \
  -H "Authorization: Bearer YOUR_API_TOKEN" | jq .
```

### "How do I add a new LLM provider?"
Just change the secrets:
```bash
npx wrangler secret put LLM_PROVIDER  # Enter: ai-sdk
npx wrangler secret put LLM_MODEL     # Enter: anthropic/claude-sonnet-4
npx wrangler secret put ANTHROPIC_API_KEY  # Enter your key
```

No code changes needed. The agent will start using Claude on the next cycle.

---

## API Quick Reference

```bash
BASE="https://your-worker.workers.dev"
TOKEN="your-api-token"
AUTH="-H 'Authorization: Bearer $TOKEN'"

# Health check (no auth)
curl $BASE/health

# Full status
curl $BASE/agent/status $AUTH

# Enable/disable trading
curl -X POST $BASE/agent/enable $AUTH
curl -X POST $BASE/agent/disable $AUTH

# Get/update config
curl $BASE/agent/config $AUTH
curl -X POST $BASE/agent/config $AUTH \
  -H "Content-Type: application/json" \
  -d '{"take_profit_pct": 15}'

# View data
curl $BASE/agent/signals $AUTH
curl $BASE/agent/logs?limit=50 $AUTH
curl $BASE/agent/costs $AUTH
curl "$BASE/agent/history?period=1W&timeframe=15Min" $AUTH

# Manual trigger
curl -X POST $BASE/agent/trigger $AUTH

# Emergency stop
curl -X POST $BASE/agent/kill \
  -H "Authorization: Bearer YOUR_KILL_SWITCH_SECRET"
```
