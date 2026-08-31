import { describe, it, expect } from 'vitest';
import { scanSql } from './sql-token-scanner';

// Ported from the backend's sql-token-scanner.spec.ts alongside the module itself — see
// sql-token-scanner.ts for why the two must stay byte-for-byte identical.
describe('scanSql', () => {
  it('does not read a tag inside a string literal as code', () => {
    const tokens = scanSql(`CASE WHEN s = '{{ref field="x"}}' THEN 1 END`);
    expect(tokens.filter(t => t.kind === 'string').map(t => t.value)).toEqual([
      `'{{ref field="x"}}'`,
    ]);
  });

  it('skips line and block comments', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\n/* SUM(c) */ + 1');
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual(['SUM', 'a']);
  });

  // Every warehouse ends a line comment at a lone CR, so the editor must grey out only up to it —
  // otherwise a reference after the CR shows as unresolved here while the backend judges it live.
  it('ends a line comment at a lone carriage return', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\rSUM(c)');
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual([
      'SUM',
      'a',
      'SUM',
      'c',
    ]);
  });

  it('ends a line comment at the CR of a CRLF pair', () => {
    const tokens = scanSql('SUM(a) -- SUM(b)\r\nSUM(c)');
    expect(tokens.filter(t => t.kind === 'comment').map(t => t.value)).toEqual(['-- SUM(b)']);
  });

  it('handles a doubled quote inside a string', () => {
    expect(scanSql(`'it''s'`)[0].value).toBe(`'it''s'`);
  });

  it('does not hang or throw on an unterminated string literal', () => {
    const sql = `SELECT '${'x'.repeat(10)} unterminated`;
    let tokens: ReturnType<typeof scanSql> = [];
    expect(() => {
      tokens = scanSql(sql);
    }).not.toThrow();
    const strings = tokens.filter(t => t.kind === 'string');
    expect(strings).toHaveLength(1);
    // the literal runs to the end of input rather than being dropped or split
    expect(strings[0].end).toBe(sql.length);
    expect(sql.slice(strings[0].start, strings[0].end)).toBe(strings[0].value);
  });

  it('does not hang or throw on an unterminated block comment', () => {
    const sql = '/* SUM(a) never closed';
    let tokens: ReturnType<typeof scanSql> = [];
    expect(() => {
      tokens = scanSql(sql);
    }).not.toThrow();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe('comment');
    expect(tokens[0].end).toBe(sql.length);
    expect(sql.slice(tokens[0].start, tokens[0].end)).toBe(sql);
  });

  it('reads a quoted identifier that contains a paren as a single token', () => {
    const sql = `SUM("weird(name")`;
    const tokens = scanSql(sql);
    const identifiers = tokens.filter(t => t.kind === 'quotedIdentifier');
    expect(identifiers).toHaveLength(1);
    expect(sql.slice(identifiers[0].start, identifiers[0].end)).toBe(identifiers[0].value);
    expect(identifiers[0].value).toBe(`"weird(name"`);
  });

  it('reads DISTINCT as a plain word token, not a keyword', () => {
    const tokens = scanSql('COUNT(DISTINCT x)');
    const distinct = tokens.find(t => t.value === 'DISTINCT');
    expect(distinct).toEqual(expect.objectContaining({ kind: 'word', value: 'DISTINCT' }));
  });
});

describe('scanSql — numeric literal boundaries', () => {
  it('splits an unspaced plus into number, punct, number', () => {
    const tokens = scanSql('1+2');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1'],
      ['punct', '+'],
      ['number', '2'],
    ]);
  });

  it('reads a signed exponent as part of the same number token', () => {
    const tokens = scanSql('1e-3');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([['number', '1e-3']]);
  });

  it('does not treat a trailing bare "e" as an exponent', () => {
    const tokens = scanSql('1e');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1'],
      ['word', 'e'],
    ]);
  });

  it('pins the deliberate reading of a second dot as its own punct token', () => {
    const tokens = scanSql('1.5.2');
    expect(tokens.map(t => [t.kind, t.value])).toEqual([
      ['number', '1.5'],
      ['punct', '.'],
      ['number', '2'],
    ]);
  });
});
