import {
  EXACT_NUMERIC_TYPES,
  INTEGER_TYPES,
  isIntegerType,
  mayDivideAsWholeNumbers,
  NUMBER_TYPES,
} from './field-type-category';

describe('mayDivideAsWholeNumbers', () => {
  // The predicate is a refusal input for the formula lift, so a spelling it misses is a moved
  // number on Athena or Redshift rather than a failure anywhere.
  it.each([...INTEGER_TYPES])('says %s may divide as whole numbers', type => {
    expect(mayDivideAsWholeNumbers(type)).toBe(true);
  });

  it.each([...EXACT_NUMERIC_TYPES])(
    'says %s may too, because the schema erases its scale',
    type => {
      expect(mayDivideAsWholeNumbers(type)).toBe(true);
    }
  );

  it.each(['FLOAT', 'REAL', 'DOUBLE', 'DOUBLE PRECISION'])(
    'says %s may not: a floating type always divides fractionally',
    type => {
      expect(mayDivideAsWholeNumbers(type)).toBe(false);
    }
  );

  it.each(['STRING', 'DATE', 'BOOLEAN', 'JSON'])('says %s may not: it is never divided', type => {
    expect(mayDivideAsWholeNumbers(type)).toBe(false);
  });

  it('normalizes case and surrounding space, the way a declared type reaches it', () => {
    expect(mayDivideAsWholeNumbers('  bigint ')).toBe(true);
  });

  it('answers false for an absent type rather than throwing', () => {
    expect(mayDivideAsWholeNumbers(undefined)).toBe(false);
  });

  it('covers every number spelling: each is either whole-number or floating, never neither', () => {
    // Pins the partition itself — a numeric type added to one family and not the other would
    // otherwise be silently readable as "cannot truncate".
    for (const type of NUMBER_TYPES) {
      const whole = mayDivideAsWholeNumbers(type);
      const floating = ['FLOAT', 'REAL', 'DOUBLE', 'DOUBLE PRECISION'].includes(type);
      expect(whole || floating).toBe(true);
      expect(whole && floating).toBe(false);
    }
  });

  it('is deliberately WIDER than isIntegerType, which decides the cast instead', () => {
    // Widening `isIntegerType` to match would stop the DECIMAL(38,18) cast that removes this very
    // truncation — two questions, two predicates.
    expect(mayDivideAsWholeNumbers('DECIMAL')).toBe(true);
    expect(isIntegerType('DECIMAL')).toBe(false);
  });
});
