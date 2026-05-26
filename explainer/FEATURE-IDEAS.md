# MAHORAGA - Feature Ideas

Ideas to make this autonomous trading agent even more powerful.

---

## Tier 1: High Impact, Buildable Now

### 1. Multi-Timeframe Confluence Engine
**What**: Instead of a single sentiment score, layer multiple timeframes together.
- 5-minute momentum (scalp signals)
- 1-hour trend (swing confirmation)
- Daily structure (macro direction)
- Only enter when 2+ timeframes agree

**Why it's powerful**: Right now the agent treats a 10-minute Reddit spike the same as a multi-day trend. A confluence engine would dramatically reduce false entries by requiring agreement across timeframes.

---

### 2. Adaptive Position Sizing (Kelly Criterion)
**What**: Replace the fixed 25% position sizing with dynamic sizing based on win rate and historical edge.

```
Kelly % = Win Rate - (Loss Rate / Win-Loss Ratio)
```

- Track rolling win rate over last 50 trades
- Automatically increase size when the agent is on a hot streak
- Automatically decrease when losing
- Never exceed 2x the base size (half-Kelly for safety)

**Why it's powerful**: Fixed sizing leaves money on the table during high-conviction streaks and risks too much during drawdowns. Kelly sizing is mathematically optimal.

---

### 3. Sector Rotation Awareness
**What**: Track which sectors are hot vs cold and bias the agent toward momentum sectors.

- Monitor sector ETFs (XLF, XLK, XLE, XLV, etc.)
- Track sector relative strength vs SPY
- Boost confidence for stocks in strong sectors
- Penalize entries in weak sectors
- Detect sector rotation events (money flowing from tech to energy, etc.)

**Why it's powerful**: Most retail sentiment signals work better when aligned with institutional sector flows. A stock trending on Reddit in a weak sector is a trap more often than not.

---

### 4. Earnings Calendar Integration
**What**: Pull earnings calendars and automatically:
- Avoid buying stocks within 3 days of earnings (high IV, binary risk)
- Close positions 1 day before earnings unless conviction is extremely high
- Monitor post-earnings moves for gap-and-go opportunities
- Track earnings surprise history per stock

**Why it's powerful**: Earnings events are the #1 destroyer of sentiment-based positions. The agent currently has no awareness of upcoming catalysts and could easily buy right before a 20% earnings gap down.

---

### 5. Correlation-Aware Portfolio
**What**: Before entering a new position, check its correlation with existing positions.

- Calculate rolling 20-day correlation between candidates and held positions
- Block entries that would create >0.7 correlation with existing positions
- Enforce sector diversification (max 2 positions per sector)
- Track overall portfolio beta vs SPY

**Why it's powerful**: Right now the agent could load up on 5 tech stocks that all move together, creating a concentrated risk. Correlation awareness turns 5 positions into truly diversified bets.

---

### 6. Discord Command Interface
**What**: Make the Discord webhook bidirectional - not just notifications but also commands.

```
/status          - Get agent status
/positions       - Show open positions
/buy AAPL 0.8    - Manual entry with 80% confidence
/sell TSLA       - Manual close
/pause 2h        - Pause agent for 2 hours
/config tp 15    - Set take profit to 15%
/research NVDA   - Request LLM research report
```

**Why it's powerful**: Mobile control without needing the dashboard. Get notifications and respond instantly from your phone.

---

### 7. Signal Decay Heatmap & Analytics
**What**: Store historical signal accuracy and build a feedback loop.

- Track: which signals led to profitable trades vs losses
- Score each data source's historical accuracy
- Dynamically adjust source weights based on performance
- Build a "source leaderboard" (e.g., "SEC filings predicted 73% of winning trades")

**Why it's powerful**: The current source weights are manually tuned guesses. This would make the agent learn which signals actually work over time and automatically get better.

---

## Tier 2: Medium Complexity, High Reward

### 8. News Sentiment NLP Pipeline
**What**: Instead of just keyword-based sentiment, use a dedicated financial NLP model.

- Fine-tuned FinBERT or similar for financial sentiment
- Process news headlines in real-time
- Extract named entities (people, companies, amounts)
- Classify news impact (high/medium/low)
- Cross-reference with existing signals

**Why it's powerful**: Keyword matching misses sarcasm, context, and nuance. A WallStreetBets post saying "AAPL calls are absolutely going to print... NOT" would currently register as bullish.

---

### 9. Volatility Regime Detection
**What**: Detect whether the market is in a low-vol, normal, or high-vol regime and adapt strategy.

- Track VIX levels and changes
- Low vol (VIX < 15): Tighter stops, longer holds, lower conviction threshold
- Normal (15-25): Default parameters
- High vol (VIX > 25): Wider stops, smaller positions, higher conviction required
- Crash regime (VIX > 35): Defensive mode - close winners, tighten stops, no new entries

**Why it's powerful**: The same strategy that works in calm markets gets destroyed in volatile ones. Regime-aware trading is how institutional quant funds operate.

---

### 10. Paper Trading Backtester
**What**: Record all signals, research, and decisions in a replay-able format.

- Store every signal snapshot with timestamp
- Record every LLM decision and reasoning
- Build a replay engine that can run through historical data
- Compare "what the agent did" vs "what would have been optimal"
- A/B test different configurations against historical data

**Why it's powerful**: Currently you can only test by running the agent live. A backtester would let you tune parameters in hours instead of weeks, and validate changes before deploying.

---

### 11. Multi-Strategy Mode
**What**: Run multiple trading strategies simultaneously with isolated risk budgets.

- **Momentum Strategy**: Current social sentiment approach
- **Mean Reversion Strategy**: Buy oversold RSI with high social volume
- **Event-Driven Strategy**: Trade SEC filings and earnings surprises
- **Crypto Momentum**: Dedicated crypto with different parameters

Each strategy gets:
- Its own position limit and cash allocation
- Independent P&L tracking
- Separate performance analytics

**Why it's powerful**: Diversification across strategies is even more powerful than diversification across stocks. When momentum strategies struggle, mean reversion often thrives.

---

### 12. Smart Order Routing
**What**: Replace simple market orders with intelligent execution.

- Use limit orders set at the current ask (avoids slippage)
- VWAP targeting for larger positions (split into smaller orders)
- Time-weighted execution (spread entry over 5-15 minutes)
- Dark pool routing for size (if supported by Alpaca)
- Iceberg orders for positions > $2,000

**Why it's powerful**: Market orders on volatile retail favorites can easily lose 0.5-1% to slippage. Over hundreds of trades, that's significant drag on returns.

---

### 13. Unusual Options Activity Scanner
**What**: Monitor options flow for institutional "smart money" signals.

- Detect large block trades (>$100k premium)
- Track put/call ratio changes per symbol
- Identify unusual volume (>3x average)
- Look for sweep orders (urgency indicator)
- Cross-reference with existing social signals

**Why it's powerful**: Institutional traders often telegraph their moves in the options market before stocks move. This is one of the highest-edge data sources available.

---

## Tier 3: Ambitious, Game-Changing

### 14. Multi-Agent Architecture
**What**: Split the monolithic harness into specialized agents that communicate.

- **Scout Agent**: Only gathers and scores signals (runs every 15s)
- **Researcher Agent**: Only does deep LLM research (runs on demand)
- **Risk Agent**: Monitors portfolio health, correlation, regime (runs every 30s)
- **Executor Agent**: Only places and manages orders
- **Reviewer Agent**: Post-trade analysis and learning

Each agent has its own Durable Object, its own alarm schedule, and communicates via internal HTTP.

**Why it's powerful**: Separation of concerns allows each agent to be individually tuned, tested, and scaled. The current 3,400-line harness is a maintenance challenge.

---

### 15. Reinforcement Learning Trade Optimizer
**What**: Train a lightweight RL model on historical trade outcomes to optimize parameters.

- State: current positions, market regime, signal strength, time of day
- Actions: buy/sell/hold, position size, stop placement
- Reward: risk-adjusted P&L (Sharpe ratio)
- Run in simulation alongside live agent
- Gradually blend RL decisions with rule-based decisions

**Why it's powerful**: The current parameters are static. An RL system would continuously adapt to changing market conditions and learn patterns no human could program.

---

### 16. Cross-Asset Intelligence
**What**: Use relationships between asset classes to improve stock picks.

- Bond yields rising -> bearish for growth tech, bullish for financials
- Dollar strengthening -> bearish for commodities and multinationals
- Oil spiking -> bullish for energy, bearish for airlines/transport
- Bitcoin rallying -> bullish for crypto-exposed stocks (MSTR, COIN)
- VIX spiking -> general risk-off, tighten everything

**Why it's powerful**: Markets are interconnected. The agent currently trades stocks in isolation, missing macro signals that professional traders use every day.

---

### 17. Social Graph Analysis
**What**: Track influential posters over time and weight their signals differently.

- Build a profile for each StockTwits/Reddit poster
- Track their historical prediction accuracy
- High-accuracy posters' signals get boosted
- Known pumpers and bots get filtered out
- Detect coordinated pump campaigns (cluster detection)

**Why it's powerful**: Not all Reddit posts are equal. A DD post from a consistently profitable analyst is worth 100 "diamond hands" meme posts. This would dramatically improve signal quality.

---

### 18. Real-Time Tape Reading
**What**: Process Level 2 / Time & Sales data for micro-structure signals.

- Detect large block prints (institutional buying)
- Monitor bid/ask spread changes (liquidity drying up = danger)
- Track dark pool prints
- Identify accumulation vs distribution patterns
- Use as a final confirmation before executing entries

**Why it's powerful**: The ultimate "what is actually happening right now" signal. Social sentiment tells you what retail thinks; the tape tells you what money is actually doing.

---

### 19. Telegram/WhatsApp Alert Bot
**What**: Beyond Discord, push critical alerts to personal messaging apps.

- Instant push notifications for:
  - Trade executions
  - Positions hitting stop/profit levels
  - Kill switch activations
  - Large daily P&L changes
  - New high-conviction signals
- One-tap response buttons for manual override

**Why it's powerful**: Discord notifications can get buried. A direct message on your phone's primary messaging app ensures you never miss a critical event.

---

### 20. Portfolio Analytics Dashboard v2
**What**: Upgrade the dashboard with institutional-grade analytics.

- **Drawdown chart**: Max drawdown over time
- **Sharpe/Sortino ratios**: Rolling 30/60/90 day
- **Win rate by source**: Which data sources lead to winners?
- **Time-of-day heatmap**: When does the agent trade best?
- **Sector exposure pie chart**: Current allocation breakdown
- **Signal-to-trade funnel**: How many signals become researched -> traded -> profitable
- **LLM confidence calibration**: Is 80% confidence actually 80% accurate?
- **Monte Carlo simulation**: Project forward returns with confidence intervals

**Why it's powerful**: You can't improve what you can't measure. Right now the dashboard shows current state but lacks the analytics to understand whether the agent's strategy is actually working.

---

## Quick Wins (< 1 day each)

| Idea | Effort | Impact |
|---|---|---|
| Add email alerts (SendGrid/Resend) | 2h | Medium |
| Configurable subreddit list | 1h | Medium |
| Position age display in dashboard | 1h | Low |
| Export trade history to CSV | 2h | Medium |
| Webhook for external integrations | 3h | High |
| Custom watchlist (force-monitor symbols) | 2h | High |
| Dashboard dark/light mode toggle | 2h | Low |
| Rate limit per-source API calls | 2h | Medium |
| Add CoinGecko for better crypto data | 3h | Medium |
| Pre-market gap scanner | 4h | High |
