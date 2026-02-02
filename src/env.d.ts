export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARTIFACTS: R2Bucket;
  SESSION: DurableObjectNamespace;
  MCP_AGENT: DurableObjectNamespace;
  MAHORAGA_HARNESS: DurableObjectNamespace;

  ALPACA_API_KEY: string;
  ALPACA_API_SECRET: string;
  ALPACA_PAPER?: string;
  OPENAI_API_KEY: string;
  TWITTER_BEARER_TOKEN?: string;
  DISCORD_WEBHOOK_URL?: string;
  MAHORAGA_API_TOKEN: string;
  KILL_SWITCH_SECRET: string;

  ENVIRONMENT: string;
  FEATURE_LLM_RESEARCH: string;
  FEATURE_OPTIONS: string;

  DEFAULT_MAX_POSITION_PCT: string;
  DEFAULT_MAX_NOTIONAL_PER_TRADE: string;
  DEFAULT_MAX_DAILY_LOSS_PCT: string;
  DEFAULT_COOLDOWN_MINUTES: string;
  DEFAULT_MAX_OPEN_POSITIONS: string;
  DEFAULT_APPROVAL_TTL_SECONDS: string;
}

declare module "cloudflare:workers" {
  interface Env extends Env {}
}
