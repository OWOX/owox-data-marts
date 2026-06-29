import { parseDocument } from '../indexing/document-builder';
import { tokenize } from './tokenizer';

function normalizeFragment(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_./:-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchText(document: string | null): string {
  if (!document) return '';

  try {
    const parsed = parseDocument(document);
    return normalizeFragment(parsed.embeddingText ?? '');
  } catch {
    return normalizeFragment(document);
  }
}

export function buildDbSearchQuery(prompt: string): {
  tokens: string[];
  mysqlBooleanQuery: string;
} {
  const tokens = Array.from(tokenize(prompt));

  return {
    tokens,
    mysqlBooleanQuery: tokens.map(token => `+${token}*`).join(' '),
  };
}
