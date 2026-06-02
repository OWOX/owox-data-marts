import { toAthenaExecutionParameters } from './athena-execution-parameters.utils';

describe('toAthenaExecutionParameters', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(toAthenaExecutionParameters(undefined)).toBeUndefined();
    expect(toAthenaExecutionParameters([])).toBeUndefined();
  });
  it('quotes string values and escapes single quotes', () => {
    expect(toAthenaExecutionParameters([{ name: 'p0', value: "O'Brien" }])).toEqual(["'O''Brien'"]);
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
