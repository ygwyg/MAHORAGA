import OpenAI from "openai";
import { createError, ErrorCode } from "../../lib/errors";
import type { LLMProvider, CompletionParams, CompletionResult } from "../types";

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model ?? "gpt-4o-mini";
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: params.model ?? this.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 1024,
        ...(params.response_format && { response_format: params.response_format }),
      });

      const content = response.choices[0]?.message?.content ?? "";

      return {
        content,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw createError(
          ErrorCode.PROVIDER_ERROR,
          `OpenAI API error (${error.status}): ${error.message}`
        );
      }
      throw error;
    }
  }
}

export function createOpenAIProvider(config: OpenAIProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
