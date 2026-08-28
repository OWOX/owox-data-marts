import { describe, expect, it } from 'vitest';
import type { ResolvedReference } from './formula-authoring';
import {
  toLineColumn,
  violationRanges,
  violationSubject,
  type PlaceableViolation,
} from './formula-violation-ranges';

/**
 * Verbatim violations from the backend's `FormulaViolations` factories
 * (apps/backend/src/data-marts/calculated-fields/formula-violations.ts) — both halves as it sends
 * them: the structured `subject` this module places, and the message it falls back to reading when
 * there is none. Copied rather than paraphrased, so a fixture cannot quietly drift into a shape
 * that never arrives.
 */
const VIOLATIONS = {
  levelMixing: {
    subject: 'clicks',
    message:
      '`clicks` is a row-level column, so it has no defined value once a report groups rows. ' +
      'Wrap it in an aggregation (SUM / COUNT / MIN / MAX).',
  },
  unknownReference: {
    subject: 'clicks',
    message: '`clicks` no longer exists in the Data Mart.',
  },
  joinedPathNotFound: {
    subject: 'orders.amount',
    message:
      '`orders.amount` reads from `orders`, which is not joined to this Data Mart. The join may ' +
      'have been removed, or its alias renamed — point the formula at a joined Data Mart that exists.',
  },
  nestedAggregate: {
    subject: 'SUM',
    message: '`SUM` contains another aggregation. An aggregation cannot nest inside one.',
  },
  // No `subject`: the backend publishes none for a violation about the formula as a whole, and
  // this one is the reason the prose fallback still earns its place — it places the `;` usefully.
  statementSeparator: {
    message:
      'A formula is a single expression and cannot contain `;`. Remove the semicolon — a formula ' +
      'never ends a statement.',
  },
  // Two shapes, because the backend names the denominator only when a span of the formula stands
  // for the WHOLE of it — quoting a fragment would send the analyst to guard the wrong thing.
  unguardedDivision: {
    subject: 'SUM(impressions)',
    message:
      '`SUM(impressions)` can come out ZERO, and dividing by zero fails the whole report at the ' +
      'warehouse rather than leaving one cell blank. Wrap it as NULLIF(SUM(impressions), 0), ' +
      'which turns the zero into an empty cell. Advice only: this does not block the save.',
  },
  unguardedDivisionUnnamed: {
    message:
      'This formula divides by something that can come out ZERO, and dividing by zero fails the ' +
      'whole report at the warehouse rather than leaving one cell blank. Wrap the denominator as ' +
      'NULLIF(it, 0), which turns the zero into an empty cell. Advice only: this does not block ' +
      'the save.',
  },
  subquery: { message: 'A formula cannot contain a subquery.' },
} satisfies Record<string, PlaceableViolation>;

function ref(text: string, start: number, path = ''): ResolvedReference {
  return { text, start, end: start + text.length, path, field: text };
}

describe('violationSubject — the fallback for a violation carrying no subject', () => {
  it('reads the token the message opens with', () => {
    expect(violationSubject(VIOLATIONS.levelMixing.message)).toBe('clicks');
    expect(violationSubject(VIOLATIONS.nestedAggregate.message)).toBe('SUM');
  });

  it('takes the FIRST of several backticked names — the one the violation is about', () => {
    // `orders.amount` is the reference at fault; `orders` is the path it reads from.
    expect(violationSubject(VIOLATIONS.joinedPathNotFound.message)).toBe('orders.amount');
  });

  it('reads a subject that is a character rather than a name', () => {
    expect(violationSubject(VIOLATIONS.statementSeparator.message)).toBe(';');
  });

  it('has none for a message about the whole formula', () => {
    expect(violationSubject(VIOLATIONS.unguardedDivisionUnnamed.message)).toBeNull();
    expect(violationSubject(VIOLATIONS.subquery.message)).toBeNull();
  });

  // The other half of that pair: when the backend DOES name the denominator it leads with it, so
  // the fallback reads the same token the structured `subject` carries.
  it('reads the denominator a division warning names', () => {
    expect(violationSubject(VIOLATIONS.unguardedDivision.message)).toBe('SUM(impressions)');
  });
});

describe('violationRanges', () => {
  it('marks the resolved reference the violation names', () => {
    const text = 'SUM(clicks) / 2';
    expect(violationRanges(VIOLATIONS.levelMixing, text, [ref('clicks', 4)])).toEqual([
      { start: 4, end: 10 },
    ]);
  });

  it('marks a joined reference by its dotted authoring name', () => {
    const text = 'SUM(orders.amount)';
    expect(
      violationRanges(VIOLATIONS.joinedPathNotFound, text, [ref('orders.amount', 4, 'orders')])
    ).toEqual([{ start: 4, end: 17 }]);
  });

  it('marks every occurrence of a referenced field — the same name twice is the same field twice', () => {
    const text = 'SUM(clicks) / NULLIF(clicks, 0)';
    expect(
      violationRanges(VIOLATIONS.unknownReference, text, [ref('clicks', 4), ref('clicks', 21)])
    ).toEqual([
      { start: 4, end: 10 },
      { start: 21, end: 27 },
    ]);
  });

  it('prefers the structured subject over anything the message says', () => {
    // A message whose prose names something else entirely: the subject on the wire wins, so
    // rewording a sentence can never move a marker.
    const violation = { subject: 'impressions', message: '`clicks` is a row-level column.' };
    expect(violationRanges(violation, 'SUM(impressions)', [])).toEqual([{ start: 4, end: 15 }]);
  });

  it('falls back to the message when the violation carries no subject', () => {
    expect(violationRanges(VIOLATIONS.statementSeparator, 'SUM(clicks);', [])).toEqual([
      { start: 11, end: 12 },
    ]);
  });

  it('finds a name that is not a reference at all, like an aggregate call', () => {
    expect(
      violationRanges(VIOLATIONS.nestedAggregate, 'SUM(AVG(clicks))', [ref('clicks', 8)])
    ).toEqual([{ start: 0, end: 3 }]);
  });

  it('marks nothing when a non-reference name appears more than once', () => {
    // `SUM(a) / SUM(SUM(b))`: the response says one SUM nests inside another, not which, so two of
    // the three squiggles would sit on innocent code. The sentence beneath the editor still names it.
    expect(violationRanges(VIOLATIONS.nestedAggregate, 'SUM(a) / SUM(SUM(b))', [])).toEqual([]);
  });

  it('never marks a name inside a comment or a string', () => {
    const text = "SUM(impressions) -- SUM of clicks\n + LENGTH('clicks')";
    expect(violationRanges(VIOLATIONS.unknownReference, text, [])).toEqual([]);
    expect(violationRanges(VIOLATIONS.nestedAggregate, text, [])).toEqual([{ start: 0, end: 3 }]);
  });

  it('never marks a longer identifier that merely contains the name', () => {
    expect(violationRanges(VIOLATIONS.nestedAggregate, 'SUMX(clicks)', [])).toEqual([]);
    expect(violationRanges(VIOLATIONS.unknownReference, 'SUM(orders.clicks)', [])).toEqual([]);
  });

  it('places nothing for a violation that names no token', () => {
    expect(
      violationRanges(VIOLATIONS.unguardedDivisionUnnamed, 'SUM(clicks) / SUM(impressions)', [])
    ).toEqual([]);
  });

  // …and marks the denominator when the violation does name one, which is the whole reason it
  // carries a subject rather than leaving the reader to find the division themselves.
  it('marks the denominator a division warning names', () => {
    expect(
      violationRanges(VIOLATIONS.unguardedDivision, 'SUM(clicks) / SUM(impressions)', [])
    ).toEqual([{ start: 14, end: 30 }]);
  });

  it('ignores a reference whose span no longer holds its own text', () => {
    // The response describes the formula as it was 200 ms ago; the analyst has since deleted the
    // opening of it, so the recorded span now covers something else entirely.
    const text = 'clicks';
    expect(violationRanges(VIOLATIONS.unknownReference, text, [ref('clicks', 4)])).toEqual([
      { start: 0, end: 6 },
    ]);
  });

  it('places nothing when the name is gone from the formula', () => {
    expect(violationRanges(VIOLATIONS.unknownReference, 'SUM(impressions)', [])).toEqual([]);
  });
});

describe('toLineColumn', () => {
  it('is 1-based on a single line', () => {
    expect(toLineColumn('SUM(clicks)', 0)).toEqual({ lineNumber: 1, column: 1 });
    expect(toLineColumn('SUM(clicks)', 4)).toEqual({ lineNumber: 1, column: 5 });
  });

  it('counts line breaks', () => {
    const text = 'SUM(clicks)\n / SUM(impressions)';
    expect(toLineColumn(text, 15)).toEqual({ lineNumber: 2, column: 4 });
  });

  it('clamps an offset past the end instead of producing a position off the model', () => {
    expect(toLineColumn('SUM', 99)).toEqual({ lineNumber: 1, column: 4 });
  });
});
