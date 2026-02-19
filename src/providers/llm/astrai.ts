import { createError, ErrorCode } from "../../lib/errors";
import type { CompletionParams, CompletionResult, LLMProvider } from "../types";

export interface AstraiConfig {
  /** Astrai API key (sk-astrai-...) */
  apiKey: string;
  /** Default model — or "auto" to let Astrai pick the best model per request */
  model?: string;
  /** Routing strategy: "cheapest", "fastest", or "balanced" (default) */
  strategy?: "cheapest" | "fastest" | "balanced";
}

interface OpenAICompatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Astrai Provider — Intelligent AI inference router.
 *
 * Routes requests to the optimal model/provider (OpenAI, Anthropic, Google,
 * Groq, DeepInfra, etc.) based on cost, latency, and task complexity.
 *
 * - Set model to "auto" for fully automatic model selection
 * - Or specify a model like "gpt-4o" / "claude-sonnet-4" and Astrai will
 *   find the cheapest equivalent across providers
 *
 * Endpoint: https://astrai-compute.fly.dev/v1/chat/completions
 * Auth: x-api-key header
 *
 * @see https://github.com/beee003/astrai-landing
 */
export class AstraiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private strategy: string;

  constructor(config: AstraiConfig) {
    if (!config.apiKey) {
      throw createError(ErrorCode.INVALID_INPUT, "ASTRAI_API_KEY is required for Astrai provider");
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? "auto";
    this.strategy = config.strategy ?? "balanced";
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: params.model ?? this.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 1024,
      strategy: this.strategy,
    };

    if (params.response_format) {
      body.response_format = params.response_format;
    }

    let response: Response;
    try {
      response = await fetch("https://astrai-compute.fly.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "X-Astrai-App": "mahoraga",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw createError(ErrorCode.PROVIDER_ERROR, `Astrai network error: ${String(error)}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw createError(ErrorCode.PROVIDER_ERROR, `Astrai API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenAICompatResponse;
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      content,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
    };
  }
}

export function createAstraiProvider(config: AstraiConfig): AstraiProvider {
  return new AstraiProvider(config);
}
