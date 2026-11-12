import type { ConfigService } from '@nestjs/config';

export interface OpenRouterRoutingOptions {
  allowedProviders?: Iterable<string> | null;
  dataCollection: string;
  zdr: boolean;
}

export interface OpenRouterProviderSpecificFieldsOptions extends OpenRouterRoutingOptions {
  fallbackModels?: Iterable<string> | null;
}

export function parseOpenRouterCommaSeparatedConfig(
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

export function buildOpenRouterProviderConfig(
  options: OpenRouterRoutingOptions
): Record<string, unknown> {
  const providerConfig: Record<string, unknown> = {
    require_parameters: true,
  };

  const providersArray = options.allowedProviders ? Array.from(options.allowedProviders) : [];
  if (providersArray.length > 0) {
    providerConfig.only = providersArray;
    providerConfig.order = providersArray;
  }

  providerConfig.data_collection = options.dataCollection;
  providerConfig.zdr = options.zdr;

  return providerConfig;
}

export function buildOpenRouterProviderSpecificFields(
  options: OpenRouterProviderSpecificFieldsOptions
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    provider: buildOpenRouterProviderConfig(options),
  };

  const fallbackModels = options.fallbackModels ? Array.from(options.fallbackModels) : [];
  if (fallbackModels.length > 0) {
    fields.models = fallbackModels;
  }

  return fields;
}

/**
 * Reads the routing options from the AI environment.
 * A blank value means the default, so a typo cannot turn the privacy options off.
 */
export function readOpenRouterRoutingOptions(
  config: ConfigService
): OpenRouterRoutingOptions & { allowedProviders: Set<string> | null } {
  const read = (name: string, fallback: string) => config.get<string>(name)?.trim() || fallback;
  return {
    allowedProviders: parseOpenRouterCommaSeparatedConfig(read('AI_ALLOWED_PROVIDERS', ''), {
      toLowerCase: true,
    }),
    dataCollection: read('AI_DATA_COLLECTION', 'deny'),
    zdr: read('AI_ZDR', 'true').toLowerCase() === 'true',
  };
}
