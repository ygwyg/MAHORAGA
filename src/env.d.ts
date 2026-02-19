export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARTIFACTS: R2Bucket;
  SESSION: DurableObjectNamespace;
  MAHORAGA_HARNESS?: DurableObjectNamespace;

  ALPACA_API_KEY: string;
  ALPACA_API_SECRET: string;
  ALPACA_PAPER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  XAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  ASTRAI_API_KEY?: string;
  ASTRAI_STRATEGY?: "cheapest" | "fastest" | "balanced";
  LLM_PROVIDER?: "openai-raw" | "ai-sdk" | "cloudflare-gateway" | "astrai";
  LLM_MODEL?: string;
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
  interface Env extends Env { }
}
