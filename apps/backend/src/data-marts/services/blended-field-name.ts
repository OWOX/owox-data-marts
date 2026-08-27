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
 * The unified names that MORE THAN ONE visible `(aliasPath, originalFieldName)` pair folds to.
 *
 * The `__` separator can appear inside an alias segment or a field name, so two distinct pairs can
 * fold to one name — `users__archived` + `role` and `users` + `archived__role` both give
 * `users__archived__role`. Hidden fields take no part: nothing can slice one, so it is never the
 * column a name would resolve to (the same exemption `buildBlendedFieldIndex` makes).
 *
 * Lives beside the derivation because that is the only thing that decides it. `buildBlendedFieldIndex`
 * REFUSES such a name at report time, keyed by the DTO's own `name` — which IS this derivation
 * (blendable-schema.service.ts builds it with `buildBlendedFieldUnifiedName`), so the two agree by
 * construction. This function is for the readers that must refuse the same thing EARLIER, at save,
 * and that are keyed by the structural pair a `{{ref}}` tag carries rather than by the unified name.
 */
export function collectAmbiguousBlendedFieldNames(
  fields: readonly { aliasPath: string; originalFieldName: string; isHidden?: boolean }[]
): ReadonlySet<string> {
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  for (const field of fields) {
    if (field.isHidden) continue;
    // No alias path means no joined source owns it, so nothing can name it and nothing can
    // collide with it — and the derivation below has no prefix to build from.
    if (!field.aliasPath) continue;
    const name = buildBlendedFieldUnifiedName(field.aliasPath, field.originalFieldName ?? '');
    if (seen.has(name)) ambiguous.add(name);
    seen.add(name);
  }
  return ambiguous;
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
