import { UniqueCountConfig } from './unique-count-config.schema';

/**
 * The main Data Mart's key in `uniqueCountConfig`. A joined source's `aliasPath` is never empty,
 * so the empty string cannot collide with one.
 */
export const MAIN_UNIQUE_COUNT_SOURCE = '';

/**
 * The field-name token a joined source's Unique Count is published under: `orders__unique_count`.
 *
 * Lives in this schema module rather than beside the name BUILDER (services/blended-field-name.ts):
 * the MCP facade contract publishes the suffix, and the contract file must stay compilable against
 * pure types — the builder pulls in `node:crypto` for its nested-field hash.
 */
export const UNIQUE_COUNT_FIELD_TOKEN = 'unique_count';

export function normalizeUniqueCountSources(config: UniqueCountConfig | undefined): string[] {
  if (config === true) return [MAIN_UNIQUE_COUNT_SOURCE];
  if (!Array.isArray(config)) return [];
  return Array.from(new Set(config));
}

export function hasMainUniqueCount(config: UniqueCountConfig | undefined): boolean {
  return normalizeUniqueCountSources(config).includes(MAIN_UNIQUE_COUNT_SOURCE);
}

export function joinedUniqueCountSources(config: UniqueCountConfig | undefined): string[] {
  return normalizeUniqueCountSources(config).filter(s => s !== MAIN_UNIQUE_COUNT_SOURCE);
}
