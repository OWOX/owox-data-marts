import { findFunctionCalls } from './sql-function-calls';
import { scanSql } from './sql-token-scanner';

describe('findFunctionCalls', () => {
  it('finds calls with argument spans', () => {
    const sql = 'SUM(clicks) / NULLIF(SUM(impressions), 0)';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls.map(c => [c.name, sql.slice(c.argStart, c.argEnd), c.depth])).toEqual([
      ['SUM', 'clicks', 0],
      ['NULLIF', 'SUM(impressions), 0', 0],
      ['SUM', 'impressions', 1],
    ]);
  });

  it('does not treat a parenthesised group as a call', () => {
    expect(findFunctionCalls(scanSql('(a + b) * 2'))).toEqual([]);
  });

  it('keeps a parenthesised group inside an argument list as part of the argument text', () => {
    const sql = 'SUM((a + b))';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('SUM');
    expect(sql.slice(calls[0].argStart, calls[0].argEnd)).toBe('(a + b)');
  });

  it('gives a no-argument call an empty, closed argument span', () => {
    const sql = 'COUNT()';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0].closed).toBe(true);
    expect(calls[0].argStart).toBe(calls[0].argEnd);
    expect(sql.slice(calls[0].argStart, calls[0].argEnd)).toBe('');
  });

  // An unclosed call's empty-looking span must not be mistaken for a genuine zero-argument call
  // like `COUNT()` above — `closed` is what tells them apart, so a later task that resolves an
  // aggregate's field reference from its argument span reports the real fault (an unbalanced
  // paren) instead of a misleading "this aggregate has no field" validation error.
  it('marks a call unclosed when its `(` is never matched by a `)`', () => {
    const sql = 'SUM(a';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('SUM');
    expect(calls[0].closed).toBe(false);
    expect(calls[0].argStart).toBe(calls[0].argEnd);
  });

  it('computes depth for calls nested three deep', () => {
    const sql = 'A(B(C(x)))';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls.map(c => [c.name, sql.slice(c.argStart, c.argEnd), c.depth])).toEqual([
      ['A', 'B(C(x))', 0],
      ['B', 'C(x)', 1],
      ['C', 'x', 2],
    ]);
  });

  it('treats a leading DISTINCT keyword as an ordinary word inside the argument text', () => {
    const sql = 'COUNT(DISTINCT x)';
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('COUNT');
    expect(sql.slice(calls[0].argStart, calls[0].argEnd)).toBe('DISTINCT x');
  });

  it('does not read a paren inside a quoted identifier as a call boundary', () => {
    const sql = `SUM("weird(name")`;
    const calls = findFunctionCalls(scanSql(sql));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('SUM');
    expect(sql.slice(calls[0].argStart, calls[0].argEnd)).toBe(`"weird(name"`);
  });

  it('ignores calls that only appear inside a comment', () => {
    const sql = '/* SUM(a) never closed';
    expect(findFunctionCalls(scanSql(sql))).toEqual([]);
  });
});
