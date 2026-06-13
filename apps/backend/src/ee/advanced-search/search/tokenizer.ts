export const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'with',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'again',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'last',
  'show',
  'me',
  'my',
  'our',
  'get',
  'give',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'i',
  'want',
  'need',
  'find',
  'about',
  'using',
  'use',
  'many',
  'much',
  'per',
  'across',
  'vs',
  'see',
  'tell',
  'list',
  'mart',
  'data',
]);

export function toSingular(token: string): string {
  if (token.length < 4) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
      .map(toSingular)
  );
}

export function matchesAny(token: string, targetTokens: Set<string>): boolean {
  if (targetTokens.has(token)) return true;
  if (token.length >= 4) {
    for (const t of targetTokens) {
      if (t.length >= 4 && (token.startsWith(t) || t.startsWith(token))) return true;
    }
  }
  return false;
}
