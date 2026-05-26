/**
 * Reddit gatherer — sentiment from r/wallstreetbets, r/stocks, r/investing, r/options.
 */

import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import { calculateTimeDecay, detectSentiment, getEngagementMultiplier, getFlairMultiplier } from "../helpers/sentiment";
import { extractTickers, tickerCache } from "../helpers/ticker";

async function gatherReddit(ctx: StrategyContext): Promise<Signal[]> {
  const subreddits = ["wallstreetbets", "stocks", "investing", "options"];
  const tickerData = new Map<
    string,
    {
      mentions: number;
      weightedSentiment: number;
      rawSentiment: number;
      totalQuality: number;
      upvotes: number;
      comments: number;
      sources: Set<string>;
      bestFlair: string | null;
      bestFlairMult: number;
      freshestPost: number;
    }
  >();

  for (const sub of subreddits) {
    const sourceWeight = SOURCE_CONFIG.weights[`reddit_${sub}` as keyof typeof SOURCE_CONFIG.weights] || 0.7;

    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
        headers: { "User-Agent": "Mahoraga/2.0" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        data?: {
          children?: Array<{
            data: {
              title?: string;
              selftext?: string;
              created_utc?: number;
              ups?: number;
              num_comments?: number;
              link_flair_text?: string;
            };
          }>;
        };
      };
      const posts = data.data?.children?.map((c) => c.data) || [];

      for (const post of posts) {
        const text = `${post.title || ""} ${post.selftext || ""}`;
        const tickers = extractTickers(text, ctx.config.ticker_blacklist);
        const rawSentiment = detectSentiment(text);

        const timeDecay = calculateTimeDecay(post.created_utc || Date.now() / 1000);
        const engagementMult = getEngagementMultiplier(post.ups || 0, post.num_comments || 0);
        const flairMult = getFlairMultiplier(post.link_flair_text);
        const qualityScore = timeDecay * engagementMult * flairMult * sourceWeight;

        for (const ticker of tickers) {
          if (!tickerData.has(ticker)) {
            tickerData.set(ticker, {
              mentions: 0,
              weightedSentiment: 0,
              rawSentiment: 0,
              totalQuality: 0,
              upvotes: 0,
              comments: 0,
              sources: new Set(),
              bestFlair: null,
              bestFlairMult: 0,
              freshestPost: 0,
            });
          }
          const d = tickerData.get(ticker)!;
          d.mentions++;
          d.rawSentiment += rawSentiment;
          d.weightedSentiment += rawSentiment * qualityScore;
          d.totalQuality += qualityScore;
          d.upvotes += post.ups || 0;
          d.comments += post.num_comments || 0;
          d.sources.add(sub);

          if (flairMult > d.bestFlairMult) {
            d.bestFlair = post.link_flair_text || null;
            d.bestFlairMult = flairMult;
          }

          if ((post.created_utc || 0) > d.freshestPost) {
            d.freshestPost = post.created_utc || 0;
          }
        }
      }

      await ctx.sleep(1000);
    } catch (error) {
      ctx.log("Reddit", "subreddit_error", { subreddit: sub, error: String(error) });
    }
  }

  const signals: Signal[] = [];
  const alpaca = createAlpacaProviders(ctx.env);

  for (const [symbol, data] of tickerData) {
    if (data.mentions >= 2) {
      if (!tickerCache.isKnownSecTicker(symbol)) {
        const cached = tickerCache.getCachedValidation(symbol);
        if (cached === false) continue;
        if (cached === undefined) {
          const isValid = await tickerCache.validateWithAlpaca(symbol, alpaca);
          if (!isValid) {
            ctx.log("Reddit", "invalid_ticker_filtered", { symbol });
            continue;
          }
        }
      }

      const avgRawSentiment = data.rawSentiment / data.mentions;
      const avgQuality = data.totalQuality / data.mentions;
      const finalSentiment = data.totalQuality > 0 ? data.weightedSentiment / data.mentions : avgRawSentiment * 0.5;
      const freshness = calculateTimeDecay(data.freshestPost);

      signals.push({
        symbol,
        source: "reddit",
        source_detail: `reddit_${Array.from(data.sources).join("+")}`,
        sentiment: finalSentiment,
        raw_sentiment: avgRawSentiment,
        volume: data.mentions,
        upvotes: data.upvotes,
        comments: data.comments,
        quality_score: avgQuality,
        freshness,
        best_flair: data.bestFlair,
        subreddits: Array.from(data.sources),
        source_weight: avgQuality,
        reason: `Reddit(${Array.from(data.sources).join(",")}): ${data.mentions} mentions, ${data.upvotes} upvotes, quality:${(avgQuality * 100).toFixed(0)}%`,
        timestamp: Date.now(),
      });
    }
  }

  return signals;
}

export const redditGatherer: Gatherer = {
  name: "reddit",
  gather: gatherReddit,
};
