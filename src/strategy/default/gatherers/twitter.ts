/**
 * Twitter integration — confirmation signals and breaking news detection.
 *
 * Twitter is used for CONFIRMATION only — it boosts/reduces confidence
 * on signals from other sources, doesn't generate signals itself.
 *
 * Enable with TWITTER_BEARER_TOKEN secret.
 */

import type { TwitterConfirmation } from "../../../core/types";
import type { StrategyContext } from "../../types";

const MAX_DAILY_READS = 200;
const ONE_DAY_MS = 86400_000;

// ── Rate limiting ────────────────────────────────────────────────────────────

export function isTwitterEnabled(ctx: StrategyContext): boolean {
  return !!ctx.env.TWITTER_BEARER_TOKEN;
}

/**
 * Check if we can spend a Twitter read against daily budget.
 * Uses strategy state for persistence across cycles.
 */
export function canSpendTwitterRead(ctx: StrategyContext): boolean {
  const now = Date.now();
  const resetTime = ctx.state.get<number>("twitterDailyReadReset") ?? 0;
  if (now - resetTime > ONE_DAY_MS) {
    ctx.state.set("twitterDailyReads", 0);
    ctx.state.set("twitterDailyReadReset", now);
  }
  const reads = ctx.state.get<number>("twitterDailyReads") ?? 0;
  return reads < MAX_DAILY_READS;
}

function spendTwitterRead(ctx: StrategyContext, count = 1): void {
  const current = ctx.state.get<number>("twitterDailyReads") ?? 0;
  ctx.state.set("twitterDailyReads", current + count);
  ctx.log("Twitter", "read_spent", {
    count,
    daily_total: current + count,
    budget_remaining: MAX_DAILY_READS - (current + count),
  });
}

// ── Twitter API ──────────────────────────────────────────────────────────────

async function twitterSearchRecent(
  ctx: StrategyContext,
  query: string,
  maxResults = 10
): Promise<
  Array<{
    id: string;
    text: string;
    created_at: string;
    author: string;
    author_followers: number;
    retweets: number;
    likes: number;
  }>
> {
  if (!isTwitterEnabled(ctx) || !canSpendTwitterRead(ctx)) return [];

  try {
    const params = new URLSearchParams({
      query,
      max_results: Math.min(maxResults, 10).toString(),
      "tweet.fields": "created_at,public_metrics,author_id",
      expansions: "author_id",
      "user.fields": "username,public_metrics",
    });

    const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: {
        Authorization: `Bearer ${ctx.env.TWITTER_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      ctx.log("Twitter", "api_error", { status: res.status });
      return [];
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at: string;
        author_id: string;
        public_metrics?: { retweet_count?: number; like_count?: number };
      }>;
      includes?: {
        users?: Array<{
          id: string;
          username: string;
          public_metrics?: { followers_count?: number };
        }>;
      };
    };

    spendTwitterRead(ctx, 1);

    return (data.data || []).map((tweet) => {
      const user = data.includes?.users?.find((u) => u.id === tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        author: user?.username || "unknown",
        author_followers: user?.public_metrics?.followers_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        likes: tweet.public_metrics?.like_count || 0,
      };
    });
  } catch (error) {
    ctx.log("Twitter", "error", { message: String(error) });
    return [];
  }
}

// ── Confirmation ─────────────────────────────────────────────────────────────

/**
 * Gather Twitter confirmation for a symbol based on existing sentiment.
 * Returns cached result if fresh enough.
 */
export async function gatherTwitterConfirmation(
  ctx: StrategyContext,
  symbol: string,
  existingSentiment: number
): Promise<TwitterConfirmation | null> {
  const MIN_SENTIMENT_FOR_CONFIRMATION = 0.3;
  const CACHE_TTL_MS = 300_000;

  if (!isTwitterEnabled(ctx) || !canSpendTwitterRead(ctx)) return null;
  if (Math.abs(existingSentiment) < MIN_SENTIMENT_FOR_CONFIRMATION) return null;

  const cacheKey = `twitterConfirmation_${symbol}`;
  const cached = ctx.state.get<TwitterConfirmation>(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }

  const actionableKeywords = [
    "unusual",
    "flow",
    "sweep",
    "block",
    "whale",
    "breaking",
    "alert",
    "upgrade",
    "downgrade",
  ];
  const query = `$${symbol} (${actionableKeywords.slice(0, 5).join(" OR ")}) -is:retweet lang:en`;
  const tweets = await twitterSearchRecent(ctx, query, 10);

  if (tweets.length === 0) return null;

  let bullish = 0;
  let bearish = 0;
  let totalWeight = 0;
  const highlights: Array<{ author: string; text: string; likes: number }> = [];

  const bullWords = ["buy", "call", "long", "bullish", "upgrade", "beat", "squeeze", "moon", "breakout"];
  const bearWords = ["sell", "put", "short", "bearish", "downgrade", "miss", "crash", "dump", "breakdown"];

  for (const tweet of tweets) {
    const text = tweet.text.toLowerCase();
    const authorWeight = Math.min(1.5, Math.log10(tweet.author_followers + 1) / 5);
    const engagementWeight = Math.min(1.3, 1 + (tweet.likes + tweet.retweets * 2) / 1000);
    const weight = authorWeight * engagementWeight;

    let sentiment = 0;
    for (const w of bullWords) if (text.includes(w)) sentiment += 1;
    for (const w of bearWords) if (text.includes(w)) sentiment -= 1;

    if (sentiment > 0) bullish += weight;
    else if (sentiment < 0) bearish += weight;
    totalWeight += weight;

    if (tweet.likes > 50 || tweet.author_followers > 10000) {
      highlights.push({
        author: tweet.author,
        text: tweet.text.slice(0, 150),
        likes: tweet.likes,
      });
    }
  }

  const twitterSentiment = totalWeight > 0 ? (bullish - bearish) / totalWeight : 0;
  const twitterBullish = twitterSentiment > 0.2;
  const twitterBearish = twitterSentiment < -0.2;
  const existingBullish = existingSentiment > 0;

  const result: TwitterConfirmation = {
    symbol,
    tweet_count: tweets.length,
    sentiment: twitterSentiment,
    confirms_existing: (twitterBullish && existingBullish) || (twitterBearish && !existingBullish),
    highlights: highlights.slice(0, 3),
    timestamp: Date.now(),
  };

  ctx.state.set(cacheKey, result);
  ctx.log("Twitter", "signal_confirmed", {
    symbol,
    sentiment: twitterSentiment.toFixed(2),
    confirms: result.confirms_existing,
    tweet_count: tweets.length,
  });

  return result;
}

// ── Breaking news ────────────────────────────────────────────────────────────

export async function checkTwitterBreakingNews(
  ctx: StrategyContext,
  symbols: string[]
): Promise<
  Array<{
    symbol: string;
    headline: string;
    author: string;
    age_minutes: number;
    is_breaking: boolean;
  }>
> {
  if (!isTwitterEnabled(ctx) || !canSpendTwitterRead(ctx) || symbols.length === 0) return [];

  const toCheck = symbols.slice(0, 3);
  const newsQuery = `(from:FirstSquawk OR from:DeItaone OR from:Newsquawk) (${toCheck.map((s) => `$${s}`).join(" OR ")}) -is:retweet`;
  const tweets = await twitterSearchRecent(ctx, newsQuery, 5);

  const results: Array<{
    symbol: string;
    headline: string;
    author: string;
    age_minutes: number;
    is_breaking: boolean;
  }> = [];

  const MAX_NEWS_AGE_MS = 1800_000;
  const BREAKING_THRESHOLD_MS = 600_000;

  for (const tweet of tweets) {
    const tweetAge = Date.now() - new Date(tweet.created_at).getTime();
    if (tweetAge > MAX_NEWS_AGE_MS) continue;

    const mentionedSymbol = toCheck.find(
      (s) => tweet.text.toUpperCase().includes(`$${s}`) || tweet.text.toUpperCase().includes(` ${s} `)
    );

    if (mentionedSymbol) {
      results.push({
        symbol: mentionedSymbol,
        headline: tweet.text.slice(0, 200),
        author: tweet.author,
        age_minutes: Math.round(tweetAge / 60000),
        is_breaking: tweetAge < BREAKING_THRESHOLD_MS,
      });
    }
  }

  if (results.length > 0) {
    ctx.log("Twitter", "breaking_news_found", {
      count: results.length,
      symbols: results.map((r) => r.symbol),
    });
  }

  return results;
}
