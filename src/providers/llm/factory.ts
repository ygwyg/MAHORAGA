import type { Env } from "../../env.d";
import type { LLMProvider } from "../types";
import { createAISDKProvider, SUPPORTED_PROVIDERS, type SupportedProvider } from "./ai-sdk";
import { createAstraiProvider } from "./astrai";
import { createCloudflareGatewayProvider } from "./cloudflare-gateway";
import { createOpenAIProvider } from "./openai";

export type LLMProviderType = "openai-raw" | "ai-sdk" | "cloudflare-gateway" | "astrai";

/**
 * Factory function to create LLM provider based on environment configuration.
 *
 * Provider selection (via LLM_PROVIDER env):
 * - "openai-raw": Direct OpenAI API calls (default, backward compatible)
 * - "ai-sdk": Vercel AI SDK with 5 providers (OpenAI, Anthropic, Google, xAI, DeepSeek)
 * - "cloudflare-gateway": Cloudflare AI Gateway (/compat) for unified access
 * - "astrai": Astrai intelligent router — auto-selects optimal model/provider by cost, latency, task
 *
 * @param env - Environment variables
 * @returns LLMProvider instance or null if no valid configuration
 */
export function createLLMProvider(env: Env): LLMProvider | null {
  const providerType = (env.LLM_PROVIDER as LLMProviderType) ?? "openai-raw";
  const model = env.LLM_MODEL ?? "gpt-4o-mini";
  const openaiBaseUrlRaw = env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "");
  const openaiBaseUrl = openaiBaseUrlRaw ? openaiBaseUrlRaw : undefined;

  switch (providerType) {
    case "cloudflare-gateway": {
      if (!env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID || !env.CLOUDFLARE_AI_GATEWAY_ID || !env.CLOUDFLARE_AI_GATEWAY_TOKEN) {
        console.warn(
          "LLM_PROVIDER=cloudflare-gateway requires CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY_ID, and CLOUDFLARE_AI_GATEWAY_TOKEN"
        );
        return null;
      }

      // Cloudflare /compat expects provider/model. If user passes an unqualified model, default to OpenAI.
      const effectiveModel = model.includes("/") ? model : `openai/${model}`;

      return createCloudflareGatewayProvider({
        accountId: env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID,
        gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
        token: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
        model: effectiveModel,
      });
    }

    case "astrai": {
      if (!env.ASTRAI_API_KEY) {
        console.warn("LLM_PROVIDER=astrai requires ASTRAI_API_KEY");
        return null;
      }

      return createAstraiProvider({
        apiKey: env.ASTRAI_API_KEY,
        model,
        strategy: (env.ASTRAI_STRATEGY as "cheapest" | "fastest" | "balanced") ?? "balanced",
      });
    }

    case "ai-sdk": {
      // Collect all available API keys
      const apiKeys: Partial<Record<SupportedProvider, string>> = {};
      if (env.OPENAI_API_KEY) apiKeys.openai = env.OPENAI_API_KEY;
      if (env.ANTHROPIC_API_KEY) apiKeys.anthropic = env.ANTHROPIC_API_KEY;
      if (env.GOOGLE_GENERATIVE_AI_API_KEY) apiKeys.google = env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (env.XAI_API_KEY) apiKeys.xai = env.XAI_API_KEY;
      if (env.DEEPSEEK_API_KEY) apiKeys.deepseek = env.DEEPSEEK_API_KEY;

      if (Object.keys(apiKeys).length === 0) {
        console.warn("LLM_PROVIDER=ai-sdk requires at least one provider API key");
        return null;
      }

      // Check if the selected model's provider has an API key
      const [providerName] = model.split("/");
      const provider = providerName?.toLowerCase() as SupportedProvider;
      if (providerName && provider in SUPPORTED_PROVIDERS && !apiKeys[provider]) {
        console.warn(`Model '${model}' requires ${SUPPORTED_PROVIDERS[provider].envKey}`);
        return null;
      }

      return createAISDKProvider({ model, apiKeys, openaiBaseUrl });
    }
    default:
      // Backward compatible: use existing OpenAI provider
      if (!env.OPENAI_API_KEY) {
        return null;
      }
      return createOpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: model.includes("/") ? model.split("/")[1] : model,
        baseUrl: openaiBaseUrl,
      });
  }
}

/**
 * Check if LLM features are available based on environment configuration.
 */
export function isLLMConfigured(env: Env): boolean {
  const providerType = (env.LLM_PROVIDER as LLMProviderType) ?? "openai-raw";

  switch (providerType) {
    case "cloudflare-gateway":
      return !!(
        env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID &&
        env.CLOUDFLARE_AI_GATEWAY_ID &&
        env.CLOUDFLARE_AI_GATEWAY_TOKEN
      );
    case "astrai":
      return !!env.ASTRAI_API_KEY;
    case "ai-sdk":
      // Any provider API key enables AI SDK
      return !!(
        env.OPENAI_API_KEY ||
        env.ANTHROPIC_API_KEY ||
        env.GOOGLE_GENERATIVE_AI_API_KEY ||
        env.XAI_API_KEY ||
        env.DEEPSEEK_API_KEY
      );
    default:
      return !!env.OPENAI_API_KEY;
  }
}

/**
 * Get list of configured providers based on available API keys
 */
export function getConfiguredProviders(env: Env): SupportedProvider[] {
  const configured: SupportedProvider[] = [];
  if (env.OPENAI_API_KEY) configured.push("openai");
  if (env.ANTHROPIC_API_KEY) configured.push("anthropic");
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) configured.push("google");
  if (env.XAI_API_KEY) configured.push("xai");
  if (env.DEEPSEEK_API_KEY) configured.push("deepseek");
  return configured;
}
