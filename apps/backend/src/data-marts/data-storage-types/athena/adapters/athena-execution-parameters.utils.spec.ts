import { toAthenaExecutionParameters } from './athena-execution-parameters.utils';

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
