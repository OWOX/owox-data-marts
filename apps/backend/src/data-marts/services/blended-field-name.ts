import { createHash } from 'node:crypto';

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
