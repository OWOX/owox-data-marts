import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiChatProvider } from '../openai/openai-chat-provider';

/**
 * OpenRouter adapter that extends OpenAI provider.
 * OpenRouter uses OpenAI-compatible API, so we reuse most of the logic.
 *
 * KEY CONCEPT: OpenRouter allows routing models through different infrastructure providers.
 * - AI_MODEL (e.g., "deepseek/deepseek-chat-v3.1") specifies WHICH MODEL you want to use
 * - AI_FALLBACK_MODELS (e.g., "gpt-4,claude-3-opus") specifies fallback models if primary fails
 * - AI_ALLOWED_PROVIDERS (e.g., "google-vertex,azure") specifies WHICH INFRASTRUCTURE should execute it
 *   NOTE: Order matters! Providers are tried in the order specified.
 * - AI_DATA_COLLECTION (e.g., "deny", "allow") controls data collection policy
 * - AI_ZDR (e.g., "true", "false") enables zero data retention
 *
 * Configure via environment variables:
 * - AI_ALLOWED_PROVIDERS: comma-separated list (e.g., "google-vertex,azure")
 *   Order is important - OpenRouter will prioritize providers in the specified sequence.
 * - AI_FALLBACK_MODELS: comma-separated list of fallback models (e.g., "gpt-4,claude-3-opus")
 * - AI_DATA_COLLECTION: data collection policy (default: "deny")
 * - AI_ZDR: zero data retention flag (default: "true")
 */
@Injectable()
export class OpenRouterChatProvider extends OpenAiChatProvider {
  private readonly allowedProviders: Set<string> | null;
  private readonly fallbackModels: Set<string> | null;
  private readonly dataCollection: string;
  private readonly zdr: boolean;

  constructor(config: ConfigService) {
    super(config);

    // Parse allowed infrastructure providers from environment variable
    this.allowedProviders = this.parseCommaSeparatedConfig(
      config.get<string>('AI_ALLOWED_PROVIDERS', ''),
      { toLowerCase: true }
    );

    // Parse fallback models from environment variable
    this.fallbackModels = this.parseCommaSeparatedConfig(
      config.get<string>('AI_FALLBACK_MODELS', '')
    );

    // Parse data collection policy (default: "deny")
    this.dataCollection = config.get<string>('AI_DATA_COLLECTION', 'deny');

    // Parse zero data retention flag (default: true)
    this.zdr = config.get<string>('AI_ZDR', 'true').toLowerCase() === 'true';
  }

  /**
   * OpenRouter has a fixed base URL, so we don't read it from config.
   */
  protected getBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  /**
   * Add OpenRouter-specific fields to the request.
   *
   * Provider object fields:
   * - provider.require_parameters: always set to true to ensure models receive all required parameters
   * - provider.only: restricts which infrastructure providers can be used (when AI_ALLOWED_PROVIDERS is set)
   * - provider.order: specifies priority order for trying providers (mirrors the 'only' array, order matters!)
   * - provider.data_collection: controls data collection policy (default: "deny")
   * - provider.zdr: enables zero data retention for privacy (default: true)
   *
   * Model fallbacks:
   * - models: array of fallback models to try if the primary model fails (when AI_FALLBACK_MODELS is set)
   *   Note: This array contains only fallback models, not the primary model (which is in the 'model' field)
   */
  protected getProviderSpecificFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    // Build provider object with all configured settings
    const providerConfig: Record<string, unknown> = {
      require_parameters: true,
    };

    // Add provider restrictions if configured
    if (this.allowedProviders && this.allowedProviders.size > 0) {
      const providersArray = Array.from(this.allowedProviders);
      providerConfig.only = providersArray;
      providerConfig.order = providersArray;
    }

    // Always add data_collection and zdr settings
    providerConfig.data_collection = this.dataCollection;
    providerConfig.zdr = this.zdr;

    // Only add a provider object if it has any settings
    if (Object.keys(providerConfig).length > 0) {
      fields.provider = providerConfig;
    }

    // Add model fallbacks if configured
    if (this.fallbackModels && this.fallbackModels.size > 0) {
      fields.models = Array.from(this.fallbackModels);
    }

    return fields;
  }

  /**
   * Provider name for error messages.
   */
  protected getProviderName(): string {
    return 'OpenRouter';
  }

  /**
   * Parse comma-separated string from config into Set.
   * Returns null if config is empty or whitespace-only.
   *
   * @param configValue - Raw config string value
   * @param options - Parsing options
   * @param options.toLowerCase - Whether to convert values to lowercase (default: false)
   * @returns Set of parsed values or null if config is empty
   */
  private parseCommaSeparatedConfig(
    configValue: string,
    options: { toLowerCase?: boolean } = {}
  ): Set<string> | null {
    if (!configValue || !configValue.trim()) {
      return null;
    }

    const values = configValue
      .split(',')
      .map(v => v.trim())
      .map(v => (options.toLowerCase ? v.toLowerCase() : v))
      .filter(v => v.length > 0);

    if (values.length === 0) {
      return null;
    }

    return new Set(values);
  }
}
