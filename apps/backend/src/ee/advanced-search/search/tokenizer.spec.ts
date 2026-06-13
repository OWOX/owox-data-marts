import { STOP_WORDS, toSingular, tokenize, matchesAny } from './tokenizer';

describe('STOP_WORDS', () => {
  it('contains standard English stop words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
    expect(STOP_WORDS.has('is')).toBe(true);
  });

  it('contains domain-specific stop words', () => {
    expect(STOP_WORDS.has('data')).toBe(true);
    expect(STOP_WORDS.has('mart')).toBe(true);
    expect(STOP_WORDS.has('list')).toBe(true);
    expect(STOP_WORDS.has('show')).toBe(true);
  });
});

describe('toSingular', () => {
  it('converts -ies to -y for tokens longer than 4 chars', () => {
    expect(toSingular('companies')).toBe('company');
    expect(toSingular('activities')).toBe('activity');
    expect(toSingular('categories')).toBe('category');
  });

  it('converts -es to base for tokens longer than 4 chars', () => {
    expect(toSingular('boxes')).toBe('box');
    expect(toSingular('watches')).toBe('watch');
  });

  it('drops trailing -s for tokens longer than 3 chars', () => {
    expect(toSingular('users')).toBe('user');
    expect(toSingular('reports')).toBe('report');
    expect(toSingular('orders')).toBe('order');
  });

  it('does not modify tokens shorter than 4 chars', () => {
    expect(toSingular('us')).toBe('us');
    expect(toSingular('it')).toBe('it');
  });

  it('does not modify tokens that do not end in s/es/ies', () => {
    expect(toSingular('token')).toBe('token');
    expect(toSingular('revenue')).toBe('revenue');
  });

  it('does not strip -ies for 4-char token (boundary: length must be > 4)', () => {
    expect(toSingular('dies')).toBe('die');
  });
});

describe('tokenize', () => {
  it('splits camelCase into tokens', () => {
    const tokens = tokenize('getUserName');
    expect(tokens.has('get')).toBe(false);
    expect(tokens.has('user')).toBe(true);
    expect(tokens.has('name')).toBe(true);
  });

  it('splits snake_case into tokens', () => {
    const tokens = tokenize('user_profile_name');
    expect(tokens.has('user')).toBe(true);
    expect(tokens.has('profile')).toBe(true);
    expect(tokens.has('name')).toBe(true);
  });

  it('removes domain stop words', () => {
    const tokens = tokenize('data mart list show');
    expect(tokens.has('data')).toBe(false);
    expect(tokens.has('mart')).toBe(false);
    expect(tokens.has('list')).toBe(false);
    expect(tokens.has('show')).toBe(false);
  });

  it('removes standard stop words', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('quick')).toBe(true);
    expect(tokens.has('brown')).toBe(true);
    expect(tokens.has('fox')).toBe(true);
  });

  it('drops tokens shorter than 2 chars', () => {
    const tokens = tokenize('a b c de');
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('b')).toBe(false);
    expect(tokens.has('c')).toBe(false);
    expect(tokens.has('de')).toBe(true);
  });

  it('singularizes tokens', () => {
    const tokens = tokenize('users companies activities');
    expect(tokens.has('users')).toBe(false);
    expect(tokens.has('user')).toBe(true);
    expect(tokens.has('companies')).toBe(false);
    expect(tokens.has('company')).toBe(true);
    expect(tokens.has('activities')).toBe(false);
    expect(tokens.has('activity')).toBe(true);
  });

  it('lowercases all tokens', () => {
    const tokens = tokenize('REVENUE Orders');
    expect(tokens.has('revenue')).toBe(true);
    expect(tokens.has('order')).toBe(true);
  });

  it('handles mixed camelCase with acronyms', () => {
    const tokens = tokenize('getHTTPResponse');
    expect(tokens.has('http')).toBe(true);
    expect(tokens.has('response')).toBe(true);
  });

  it('deduplicates tokens (returns a Set)', () => {
    const tokens = tokenize('order order orders');
    expect(tokens.size).toBe(1);
    expect(tokens.has('order')).toBe(true);
  });

  it('keeps domain terms that are not built-in stop words', () => {
    const tokens = tokenize('revenue order profit');
    expect(tokens.has('revenue')).toBe(true);
    expect(tokens.has('order')).toBe(true);
    expect(tokens.has('profit')).toBe(true);
  });
});

describe('matchesAny', () => {
  it('returns true for exact match', () => {
    expect(matchesAny('user', new Set(['user', 'order']))).toBe(true);
  });

  it('returns false when no match', () => {
    expect(matchesAny('revenue', new Set(['user', 'order']))).toBe(false);
  });

  it('matches when token is prefix of a target (both >= 4 chars)', () => {
    expect(matchesAny('sign', new Set(['signup']))).toBe(true);
  });

  it('matches when target is prefix of token (both >= 4 chars)', () => {
    expect(matchesAny('signup', new Set(['sign']))).toBe(true);
  });

  it('does not apply prefix rule when token is shorter than 4 chars', () => {
    expect(matchesAny('sig', new Set(['signup']))).toBe(false);
  });

  it('does not apply prefix rule when target token is shorter than 4 chars', () => {
    expect(matchesAny('sign', new Set(['sig']))).toBe(false);
  });

  it('prefix rule requires both sides to be >= 4 chars', () => {
    expect(matchesAny('repo', new Set(['rep']))).toBe(false);
  });

  it('returns false for empty targetTokens', () => {
    expect(matchesAny('user', new Set())).toBe(false);
  });
});
