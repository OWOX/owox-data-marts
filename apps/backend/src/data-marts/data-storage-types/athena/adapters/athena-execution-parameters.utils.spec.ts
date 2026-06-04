import {
  toAthenaExecutionParameters,
  inlineAthenaPositionalParams,
} from './athena-execution-parameters.utils';

describe('toAthenaExecutionParameters', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(toAthenaExecutionParameters(undefined)).toBeUndefined();
    expect(toAthenaExecutionParameters([])).toBeUndefined();
  });
  it('quotes string values and escapes single quotes', () => {
    expect(toAthenaExecutionParameters([{ name: 'p0', value: "O'Brien" }])).toEqual(["'O''Brien'"]);
  });

  // These ExecutionParameters are substituted as SQL literals, not bound. This
  // escaping is the ONLY thing standing between user input and SQL injection,
  // so the adversarial cases below must stay green.
  describe('SQL-injection safety (literal escaping)', () => {
    it('neutralizes a classic breakout payload by keeping it inside one literal', () => {
      // leading quote -> doubled, then wrapped: '  ''  ) OR 1=1 --  '
      expect(toAthenaExecutionParameters([{ name: 'p0', value: "') OR 1=1 --" }])).toEqual([
        "''') OR 1=1 --'",
      ]);
    });
    it('doubles consecutive and multiple single quotes', () => {
      expect(
        toAthenaExecutionParameters([
          { name: 'p0', value: "''" },
          { name: 'p1', value: "a''b" },
          { name: 'p2', value: "'''" },
        ])
      ).toEqual(["''''''", "'a''''b'", "''''''''"]);
    });
    it('treats backslash as a literal char (Trino has no backslash escaping in string literals)', () => {
      expect(
        toAthenaExecutionParameters([
          { name: 'p0', value: 'a\\b' },
          { name: 'p1', value: "\\'" },
        ])
      ).toEqual(["'a\\b'", "'\\'''"]);
    });
    it('keeps newlines/tabs verbatim inside the literal', () => {
      expect(toAthenaExecutionParameters([{ name: 'p0', value: 'a\nb\tc' }])).toEqual([
        "'a\nb\tc'",
      ]);
    });
  });
  it('passes numbers and booleans as bare literals', () => {
    expect(
      toAthenaExecutionParameters([
        { name: 'p0', value: 42 },
        { name: 'p1', value: true },
      ])
    ).toEqual(['42', 'true']);
  });
  it('renders null as NULL', () => {
    expect(toAthenaExecutionParameters([{ name: 'p0', value: null }])).toEqual(['NULL']);
  });
  it('preserves order', () => {
    expect(
      toAthenaExecutionParameters([
        { name: 'p0', value: 'a' },
        { name: 'p1', value: 'b' },
      ])
    ).toEqual(["'a'", "'b'"]);
  });
});

describe('inlineAthenaPositionalParams', () => {
  it('returns the SQL unchanged when there are no params', () => {
    expect(inlineAthenaPositionalParams('SELECT 1', undefined)).toBe('SELECT 1');
    expect(inlineAthenaPositionalParams('SELECT 1', [])).toBe('SELECT 1');
  });

  it('replaces positional ? with literals in order', () => {
    expect(
      inlineAthenaPositionalParams('WHERE "a" = ? AND "b" > ?', [
        { name: 'p0', value: 'x' },
        { name: 'p1', value: 5 },
      ])
    ).toBe(`WHERE "a" = 'x' AND "b" > 5`);
  });

  it('inlines a string value inside a CAST wrapper so the literal stays valid', () => {
    expect(
      inlineAthenaPositionalParams('WHERE "d" >= CAST(? AS TIMESTAMP)', [
        { name: 'p0', value: '2024-01-01' },
      ])
    ).toBe(`WHERE "d" >= CAST('2024-01-01' AS TIMESTAMP)`);
  });

  it('handles a blended-style query with ? across CTEs and the final WHERE', () => {
    const sql = 'WITH s AS (SELECT * FROM t WHERE "n" > ?) SELECT * FROM s WHERE "name" = ?';
    expect(
      inlineAthenaPositionalParams(sql, [
        { name: 's_p0', value: 5 },
        { name: 'p0', value: 'admin' },
      ])
    ).toBe(`WITH s AS (SELECT * FROM t WHERE "n" > 5) SELECT * FROM s WHERE "name" = 'admin'`);
  });

  it('escapes single quotes in the inlined literal', () => {
    expect(
      inlineAthenaPositionalParams('WHERE "name" = ?', [{ name: 'p0', value: "O'Brien" }])
    ).toBe(`WHERE "name" = 'O''Brien'`);
  });

  it('does NOT treat a ? inside a string literal or identifier as a placeholder', () => {
    // is_empty renders `= ''`; a literal '?' and a quoted identifier "a?b" must survive.
    expect(
      inlineAthenaPositionalParams(`WHERE "a?b" = ? AND "c" = '?' AND "d" = ?`, [
        { name: 'p0', value: 1 },
        { name: 'p1', value: 2 },
      ])
    ).toBe(`WHERE "a?b" = 1 AND "c" = '?' AND "d" = 2`);
  });

  // Regression: the blended builder embeds the data-mart title/url as `-- ...`
  // line comments. A `?` (URLs almost always have one) or `'` there must NOT be
  // treated as a placeholder / string start — that would throw or misalign values.
  it('does not treat ? or a quote inside a -- comment as a placeholder', () => {
    const sql =
      `WITH m AS ( -- Q4 ready? O'Brien https://app/dm?id=1\n` +
      `  SELECT * FROM t WHERE "x" = ? ) SELECT * FROM m`;
    expect(inlineAthenaPositionalParams(sql, [{ name: 'p0', value: 5 }])).toBe(
      `WITH m AS ( -- Q4 ready? O'Brien https://app/dm?id=1\n  SELECT * FROM t WHERE "x" = 5 ) SELECT * FROM m`
    );
  });

  it('throws when params outnumber placeholders (guards against silent value loss)', () => {
    expect(() =>
      inlineAthenaPositionalParams('WHERE "a" = ?', [
        { name: 'p0', value: 1 },
        { name: 'p1', value: 2 },
      ])
    ).toThrow(/placeholder\/param mismatch/);
  });

  it('throws when placeholders outnumber params', () => {
    expect(() =>
      inlineAthenaPositionalParams('WHERE "a" = ? AND "b" = ?', [{ name: 'p0', value: 1 }])
    ).toThrow(/more '\?' placeholders than params/);
  });
});
