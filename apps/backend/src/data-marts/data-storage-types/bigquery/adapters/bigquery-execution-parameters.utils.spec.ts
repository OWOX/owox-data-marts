import { inlineBigQueryNamedParams } from './bigquery-execution-parameters.utils';

describe('inlineBigQueryNamedParams', () => {
  it('returns the SQL unchanged when there are no params', () => {
    expect(inlineBigQueryNamedParams('SELECT 1', undefined)).toBe('SELECT 1');
    expect(inlineBigQueryNamedParams('SELECT 1', [])).toBe('SELECT 1');
  });

  it('replaces named @params with literals', () => {
    expect(
      inlineBigQueryNamedParams('WHERE `a` = @p0 AND `b` > @p1', [
        { name: 'p0', value: 'x' },
        { name: 'p1', value: 5 },
      ])
    ).toBe("WHERE `a` = 'x' AND `b` > 5");
  });

  it('inlines a string value inside a CAST wrapper (date columns)', () => {
    expect(
      inlineBigQueryNamedParams('WHERE `d` = CAST(@p0 AS DATE)', [
        { name: 'p0', value: '2024-01-01' },
      ])
    ).toBe("WHERE `d` = CAST('2024-01-01' AS DATE)");
  });

  it('does not confuse @p1 with @p10 (longest-name token match)', () => {
    expect(
      inlineBigQueryNamedParams('WHERE a = @p1 AND b = @p10', [
        { name: 'p1', value: 1 },
        { name: 'p10', value: 10 },
      ])
    ).toBe('WHERE a = 1 AND b = 10');
  });

  it('renders booleans and null as BigQuery literals', () => {
    expect(
      inlineBigQueryNamedParams('WHERE a = @p0 AND b = @p1 AND c = @p2', [
        { name: 'p0', value: true },
        { name: 'p1', value: false },
        { name: 'p2', value: null },
      ])
    ).toBe('WHERE a = TRUE AND b = FALSE AND c = NULL');
  });

  it('leaves @name inside a string literal or backtick identifier untouched', () => {
    expect(
      inlineBigQueryNamedParams("WHERE `c@l` = @p0 AND note = '@p0 literal' AND x = @p1", [
        { name: 'p0', value: 1 },
        { name: 'p1', value: 2 },
      ])
    ).toBe("WHERE `c@l` = 1 AND note = '@p0 literal' AND x = 2");
  });

  // Regression: the blended builder embeds the data-mart title/url as `-- ...`
  // line comments. An `@name`-looking token there must NOT be substituted.
  it('does not substitute @name or interpret quotes inside a -- comment', () => {
    const sql =
      "WITH m AS ( -- Sales @p0 report O'Brien\n  SELECT * FROM t WHERE x = @p0 ) SELECT * FROM m";
    expect(inlineBigQueryNamedParams(sql, [{ name: 'p0', value: 1 }])).toBe(
      "WITH m AS ( -- Sales @p0 report O'Brien\n  SELECT * FROM t WHERE x = 1 ) SELECT * FROM m"
    );
  });

  it('throws when not every param is substituted (placeholder missing)', () => {
    expect(() =>
      inlineBigQueryNamedParams('WHERE a = @p0', [
        { name: 'p0', value: 1 },
        { name: 'p1', value: 2 },
      ])
    ).toThrow(/every param must appear exactly once/);
  });

  // These literals are persisted and executed, so escaping is the only barrier
  // against SQL injection — the adversarial cases below must stay green.
  describe('SQL-injection safety (literal escaping)', () => {
    it('keeps a classic breakout payload inside one literal (escapes the quote)', () => {
      expect(
        inlineBigQueryNamedParams('WHERE name = @p0', [{ name: 'p0', value: "') OR 1=1 --" }])
      ).toBe("WHERE name = '\\') OR 1=1 --'");
    });

    it('escapes a backslash before the quote so it cannot self-escape out', () => {
      // value: \'  → backslash doubled, then the quote escaped: '\\\''
      expect(inlineBigQueryNamedParams('WHERE a = @p0', [{ name: 'p0', value: "\\'" }])).toBe(
        "WHERE a = '\\\\\\''"
      );
    });

    it('escapes newlines/carriage returns so they cannot break the single-quoted literal', () => {
      expect(inlineBigQueryNamedParams('WHERE a = @p0', [{ name: 'p0', value: 'a\nb\rc' }])).toBe(
        "WHERE a = 'a\\nb\\rc'"
      );
    });

    it('escapes a single quote inside an otherwise normal value', () => {
      expect(
        inlineBigQueryNamedParams('WHERE name = @p0', [{ name: 'p0', value: "O'Brien" }])
      ).toBe("WHERE name = 'O\\'Brien'");
    });
  });
});
