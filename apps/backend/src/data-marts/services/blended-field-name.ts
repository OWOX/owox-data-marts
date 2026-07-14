import { createHash } from 'node:crypto';

/** First 8 hex chars of sha1(aliasPath + '|' + originalFieldName) — a stable
 * per-field identity, independent of any other field that does or doesn't exist. */
function shortHash(aliasPath: string, originalFieldName: string): string {
  return createHash('sha1').update(`${aliasPath}|${originalFieldName}`).digest('hex').slice(0, 8);
}

/** Unified name used in blendable-schema payloads and report saves. */
export function buildBlendedFieldUnifiedName(
  aliasPath: string,
  sqlPrefix: string,
  originalFieldName: string
): string {
  if (!originalFieldName.includes('.')) {
    return `${sqlPrefix}__${originalFieldName}`; // flat — byte-identical to today, always
  }
  const readable = originalFieldName.replace(/\./g, '_');
  return `${sqlPrefix}__${readable}__${shortHash(aliasPath, originalFieldName)}`; // nested — always hashed
}
