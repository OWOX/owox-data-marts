import { createHash } from 'node:crypto';
import { UNIQUE_COUNT_FIELD_TOKEN } from '../dto/schemas/unique-count-sources';

/** First 8 hex chars of sha1(aliasPath + '|' + originalFieldName) — a stable
 * per-field identity, independent of any other field that does or doesn't exist. */
function shortHash(aliasPath: string, originalFieldName: string): string {
  return createHash('sha1').update(`${aliasPath}|${originalFieldName}`).digest('hex').slice(0, 8);
}

/**
 * Unified name used in blendable-schema payloads and report saves.
 * Identity depends only on `(aliasPath, originalFieldName)`:
 * - flat:   `<aliasPath dots→_>`__`<originalFieldName>`
 * - nested: `<aliasPath dots→_>`__`<originalFieldName dots→_>`__`<sha1[0:8]>`
 */
export function buildBlendedFieldUnifiedName(aliasPath: string, originalFieldName: string): string {
  const sqlPrefix = aliasPath.replace(/\./g, '_');
  if (!originalFieldName.includes('.')) {
    return `${sqlPrefix}__${originalFieldName}`; // flat — byte-identical to pre-hash naming
  }
  const readable = originalFieldName.replace(/\./g, '_');
  return `${sqlPrefix}__${readable}__${shortHash(aliasPath, originalFieldName)}`; // nested — always hashed
}

/**
 * The SQL output column for a joined source's Unique Count: `orders` → `orders__unique_count`,
 * `orders.items` → `orders_items__unique_count`.
 *
 * Derived from the alias path, whose segments the Join Settings form validates against
 * `^[a-z0-9_]+$`, so the result is a legal identifier in every dialect. The source's DISPLAY prefix
 * (`defaultAlias`) is free-form and must never reach SQL — it travels as
 * `JoinedUniqueCountSource.displayLabel` instead.
 */
export function buildJoinedUniqueCountColumnName(aliasPath: string): string {
  return buildBlendedFieldUnifiedName(aliasPath, UNIQUE_COUNT_FIELD_TOKEN);
}
