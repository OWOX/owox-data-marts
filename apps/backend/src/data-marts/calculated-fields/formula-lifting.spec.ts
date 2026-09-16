import { liftFormulaToGroupLevel, type LiftableReference } from './formula-lifting';
import { isUniversalAggregateFunction } from './formula-function-dialect';
import { renderFormula, serializeFormulaReference } from './formula-reference';

const ref = (field: string, path = '') => serializeFormulaReference({ path, field });

/** Every reference liftable, and dividing none of them truncates. */
const anyReference = (): LiftableReference => ({ truncatesUnderDivision: false });
/** Every reference liftable, but dividing any of them truncates (an INTEGER column on Trino). */
const truncatingReference = (): LiftableReference => ({ truncatesUnderDivision: true });

describe('liftFormulaToGroupLevel', () => {
  it('wraps each reference in its own aggregation', () => {
    const result = liftFormulaToGroupLevel(
      `${ref('clicks')}/${ref('impressions')}`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({
      formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})`,
    });
  });

  it('wraps a reference used twice, each occurrence', () => {
    const result = liftFormulaToGroupLevel(
      `${ref('a')}/(${ref('a')}+${ref('b')})`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({
      formula: `SUM(${ref('a')})/(SUM(${ref('a')})+SUM(${ref('b')}))`,
    });
  });

  it('wraps every reference in SUM, because a group total is a sum', () => {
    // `pickAutoAggregation` is not consulted: `MAX(revenue)-MAX(cost)` is not `Σ(revenue-cost)`
    // however well-governed each half is.
    const result = liftFormulaToGroupLevel(
      `${ref('revenue')}-${ref('cost')}`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: `SUM(${ref('revenue')}-${ref('cost')}\n)` });
  });

  it('refuses a formula that already aggregates', () => {
    const result = liftFormulaToGroupLevel(
      `SUM(${ref('clicks')})/${ref('impressions')}`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'contains-aggregate' });
  });

  it('refuses when a reference may not be lifted at all', () => {
    const result = liftFormulaToGroupLevel(
      `${ref('clicks')}/${ref('label')}`,
      (_path, field) => (field === 'label' ? undefined : anyReference()),
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'unaggregatable-reference' });
  });

  it('refuses a field the product may not SUM, rather than summing it anyway', () => {
    // There is no second-best rewrite: the formula either recomputes from group totals or is left
    // alone.
    const result = liftFormulaToGroupLevel(
      `${ref('revenue')}-${ref('cost')}`,
      (_path, field) => (field === 'cost' ? undefined : anyReference()),
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'unaggregatable-reference' });
  });

  it('hands the reference path to the caller so a joined one can be refused', () => {
    const result = liftFormulaToGroupLevel(
      `${ref('clicks')}/${ref('cost', 'ads')}`,
      path => (path === '' ? anyReference() : undefined),
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'unaggregatable-reference' });
  });

  it('refuses a formula with no live references', () => {
    expect(liftFormulaToGroupLevel('1/2', anyReference, isUniversalAggregateFunction)).toEqual({
      formula: null,
      reason: 'no-references',
    });
  });

  it('ignores a reference inside a comment', () => {
    const result = liftFormulaToGroupLevel(
      `${ref('clicks')} -- ${ref('impressions')}`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: `SUM(${ref('clicks')} -- ${ref('impressions')}\n)` });
  });

  it('refuses when every reference is commented out', () => {
    const result = liftFormulaToGroupLevel(
      `1 -- ${ref('clicks')}`,
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'no-references' });
  });

  it('refuses an unparseable formula instead of throwing', () => {
    const result = liftFormulaToGroupLevel(
      '{{clicks}}/{{impressions}}',
      anyReference,
      isUniversalAggregateFunction
    );
    expect(result).toEqual({ formula: null, reason: 'unparseable-formula' });
  });

  it('asks the caller, not a hardcoded list, whether a call aggregates', () => {
    const formula = `MEDIAN(${ref('clicks')})`;
    expect(
      liftFormulaToGroupLevel(formula, anyReference, name => name.toUpperCase() === 'MEDIAN')
    ).toEqual({ formula: null, reason: 'contains-aggregate' });
    // Still refused, by the shape guard rather than by this predicate: two independent floors.
    expect(liftFormulaToGroupLevel(formula, anyReference, () => false)).toEqual({
      formula: null,
      reason: 'non-distributive-formula',
    });
  });
});

describe('liftFormulaToGroupLevel — where SUM is placed, and why NULL decides it', () => {
  const lift = (formula: string) =>
    liftFormulaToGroupLevel(formula, anyReference, isUniversalAggregateFunction);

  it('wraps a linear formula WHOLE, so a NULL operand counts for nothing exactly as it displayed', () => {
    // Rows (revenue 100, cost NULL) and (200, 50) display NULL and 150, and total 150.
    // `SUM(revenue - cost)` answers 150. `SUM(revenue) - SUM(cost)` answers 250 — it counts a
    // revenue whose row showed no value at all.
    expect(lift(`${ref('revenue')}-${ref('cost')}`)).toEqual({
      formula: `SUM(${ref('revenue')}-${ref('cost')}\n)`,
    });
  });

  it('wraps each reference of a RATIO, because the whole-text form would average row ratios', () => {
    // `SUM(a/b)` is the sum of per-row ratios, which is not the group ratio at any fan-out. The
    // per-reference form is the ratio of totals, and it deliberately counts a numerator whose
    // denominator is NULL — the documented reading of a collapsed ratio.
    expect(lift(`${ref('revenue')}/${ref('cost')}`)).toEqual({
      formula: `SUM(${ref('revenue')})/SUM(${ref('cost')})`,
    });
  });

  it('treats a NULLIF-guarded denominator as a division, not as a linear formula', () => {
    expect(lift(`${ref('revenue')}/NULLIF(${ref('cost')},0)`)).toEqual({
      formula: `SUM(${ref('revenue')})/NULLIF(SUM(${ref('cost')}),0)`,
    });
  });

  it('closes the whole-text wrapper on its own line, so a trailing comment cannot eat the paren', () => {
    const lifted = lift(`${ref('clicks')} -- trailing`);
    expect(lifted.formula).toBe(`SUM(${ref('clicks')} -- trailing\n)`);
    expect(lifted.formula?.endsWith('\n)')).toBe(true);
  });
});

describe('liftFormulaToGroupLevel — the distributivity guard', () => {
  const lift = (formula: string) =>
    liftFormulaToGroupLevel(formula, anyReference, isUniversalAggregateFunction);
  const refused = { formula: null, reason: 'non-distributive-formula' };

  it('refuses a product of two references, because Σ(q·p) ≠ Σq·Σp', () => {
    // Two rows: (quantity 2, unit_price 3) and (quantity 4, unit_price 5).
    const rows = [
      { quantity: 2, unitPrice: 3 },
      { quantity: 4, unitPrice: 5 },
    ];
    const trueGroupTotal = rows.reduce((total, row) => total + row.quantity * row.unitPrice, 0);
    const liftedAnswer =
      rows.reduce((total, row) => total + row.quantity, 0) *
      rows.reduce((total, row) => total + row.unitPrice, 0);
    expect([trueGroupTotal, liftedAnswer]).toEqual([26, 48]);

    expect(lift(`${ref('quantity')}*${ref('unit_price')}`)).toEqual(refused);
  });

  it('refuses an FX conversion — a reference scaled by another reference', () => {
    expect(lift(`${ref('cost_local')}*${ref('fx_rate')}`)).toEqual(refused);
  });

  it('refuses a discounted price — a reference times a bracket holding a reference', () => {
    expect(lift(`${ref('price')}*(1-${ref('discount')})`)).toEqual(refused);
  });

  it('refuses a bare literal added to a reference, which would need +5n', () => {
    expect(lift(`${ref('clicks')}+5`)).toEqual(refused);
    expect(lift(`${ref('clicks')}-5`)).toEqual(refused);
  });

  it('refuses a conditional, whose meaning changes rather than its value', () => {
    expect(lift(`CASE WHEN ${ref('clicks')}>5 THEN 1 ELSE 0 END`)).toEqual(refused);
  });

  it('refuses a scalar function that is not on the whitelist', () => {
    expect(lift(`COALESCE(${ref('clicks')},0)`)).toEqual(refused);
    expect(lift(`ROUND(${ref('clicks')},2)`)).toEqual(refused);
    expect(lift(`LOWER(${ref('clicks')})`)).toEqual(refused);
  });

  it('lifts the NULLIF-guarded ratio this repo’s own linter asks analysts to write', () => {
    // `FORMULA_UNGUARDED_DIVISION` (formula-violations.ts) advises "Wrap it as NULLIF(x, 0)", so
    // refusing this shape would decline to collapse a report for complying with our own advice.
    expect(lift(`${ref('revenue')}/NULLIF(${ref('cost')},0)`)).toEqual({
      formula: `SUM(${ref('revenue')})/NULLIF(SUM(${ref('cost')}),0)`,
    });
  });

  it('lifts SAFE_DIVIDE as the root ratio, exactly as it lifts `/`', () => {
    expect(lift(`SAFE_DIVIDE(${ref('clicks')},${ref('impressions')})`)).toEqual({
      formula: `SAFE_DIVIDE(SUM(${ref('clicks')}),SUM(${ref('impressions')}))`,
    });
    expect(lift(`SAFE_DIVIDE(${ref('a')}+${ref('b')},${ref('c')})`)).toEqual({
      formula: `SAFE_DIVIDE(SUM(${ref('a')})+SUM(${ref('b')}),SUM(${ref('c')}))`,
    });
    // The denominator of the formula's one top-level division, whichever way it is spelled.
    expect(lift(`SAFE_DIVIDE(${ref('a')},NULLIF(${ref('b')},0))`)).toEqual({
      formula: `SAFE_DIVIDE(SUM(${ref('a')}),NULLIF(SUM(${ref('b')}),0))`,
    });
  });

  it('refuses NULLIF comparing two references — that is not a zero guard', () => {
    expect(lift(`NULLIF(${ref('a')},${ref('b')})`)).toEqual(refused);
    expect(lift(`${ref('revenue')}/NULLIF(${ref('cost')},${ref('other')})`)).toEqual(refused);
  });

  it('refuses a whitelisted function in any other position', () => {
    expect(lift(`${ref('a')}*SAFE_DIVIDE(${ref('b')},${ref('c')})`)).toEqual(refused);
    expect(lift(`SAFE_DIVIDE(${ref('a')},${ref('b')})+${ref('c')}`)).toEqual(refused);
    expect(lift(`NULLIF(${ref('a')},0)/${ref('b')}`)).toEqual(refused);
  });

  it('refuses a ratio that is not the whole formula', () => {
    // The numerator/denominator exception is the ROOT division and nothing else.
    expect(lift(`${ref('a')}/${ref('b')}*${ref('c')}`)).toEqual(refused);
    expect(lift(`${ref('a')}/${ref('b')}+${ref('c')}`)).toEqual(refused);
    expect(lift(`${ref('a')}/(${ref('b')}/${ref('c')})`)).toEqual(refused);
  });

  it('refuses text it cannot classify at all', () => {
    expect(lift(`${ref('clicks')} AND ${ref('impressions')}`)).toEqual(refused);
    expect(lift(`${ref('clicks')}||'x'`)).toEqual(refused);
    expect(lift(`(${ref('clicks')}`)).toEqual(refused);
    expect(lift(`${ref('clicks')} ${ref('impressions')}`)).toEqual(refused);
  });

  it('still lifts every shape the rewrite is exact for', () => {
    expect(lift(`${ref('revenue')}-${ref('cost')}`)).toEqual({
      formula: `SUM(${ref('revenue')}-${ref('cost')}\n)`,
    });
    expect(lift(`${ref('amount')}*1.2`)).toEqual({ formula: `SUM(${ref('amount')}*1.2\n)` });
    expect(lift(`${ref('amount')}/100`)).toEqual({ formula: `SUM(${ref('amount')})/100` });
    expect(lift(`(${ref('a')}+${ref('b')})/${ref('c')}`)).toEqual({
      formula: `(SUM(${ref('a')})+SUM(${ref('b')}))/SUM(${ref('c')})`,
    });
    // A constant factor built from literals holds no reference, so it is not a `+` against one.
    expect(lift(`${ref('amount')}*(1+0.2)`)).toEqual({
      formula: `SUM(${ref('amount')}*(1+0.2)\n)`,
    });
  });
});

describe('liftFormulaToGroupLevel — a reference in a divisor', () => {
  const lift = (formula: string) =>
    liftFormulaToGroupLevel(formula, anyReference, isUniversalAggregateFunction);
  const refused = { formula: null, reason: 'non-distributive-formula' };

  it('refuses `1/{{x}}` and every spelling that hides one', () => {
    // A reference alone in a divisor is degree -1, which no aggregation distributes over. Each of
    // these passes an "at most one operand holds a reference" reading.
    for (const formula of [
      `1/${ref('sessions')}`,
      `2/${ref('a')}+3/${ref('b')}`,
      `${ref('a')}-100/${ref('b')}`,
      `2*(1/${ref('a')})`,
      `1/${ref('a')}/${ref('b')}`,
      `1/(${ref('a')}+${ref('b')})`,
      `SAFE_DIVIDE(2,${ref('a')})`,
      `2/NULLIF(${ref('a')},0)`,
      `${ref('a')}/NULLIF(1/${ref('b')},0)`,
      `SAFE_DIVIDE(${ref('a')},1/${ref('b')})`,
    ]) {
      expect([formula, lift(formula)]).toEqual([formula, refused]);
    }
  });

  it('refuses `q/(1/p)`, which is `q*p` spelled so the operand count cannot see it', () => {
    // Rows (1, 3) and (2, 5). `q/(1/p)` is `q*p`, so the true total is 1*3 + 2*5 = 13 while
    // SUM(q)/(1/SUM(p)) is (1+2)*(3+5) = 24.
    const rows = [
      { quantity: 1, unitPrice: 3 },
      { quantity: 2, unitPrice: 5 },
    ];
    const trueGroupTotal = rows.reduce((total, row) => total + row.quantity * row.unitPrice, 0);
    const liftedAnswer =
      rows.reduce((total, row) => total + row.quantity, 0) *
      rows.reduce((total, row) => total + row.unitPrice, 0);
    expect([trueGroupTotal, liftedAnswer]).toEqual([13, 24]);

    expect(lift(`${ref('quantity')}/(1/${ref('unit_price')})`)).toEqual(refused);
  });

  it('still lifts a reference divided by a reference-free divisor', () => {
    expect(lift(`${ref('amount')}/100`)).toEqual({ formula: `SUM(${ref('amount')})/100` });
    expect(lift(`${ref('amount')}/(100*2)`)).toEqual({ formula: `SUM(${ref('amount')})/(100*2)` });
  });
});

describe('liftFormulaToGroupLevel — division that truncates', () => {
  const liftInteger = (formula: string) =>
    liftFormulaToGroupLevel(formula, truncatingReference, isUniversalAggregateFunction);

  it('refuses a literal divisor, because INTEGER/INTEGER truncates on Athena and Redshift', () => {
    // Two rows of amount = 150. Per row `amount/100` truncates to 1, totalling 2, while
    // SUM(amount)/100 is 3.
    const rows = [150, 150];
    const truncatedRowTotal = rows.reduce((total, amount) => total + Math.trunc(amount / 100), 0);
    const liftedAnswer = rows.reduce((total, amount) => total + amount, 0) / 100;
    expect([truncatedRowTotal, liftedAnswer]).toEqual([2, 3]);

    expect(liftInteger(`${ref('amount')}/100`)).toEqual({
      formula: null,
      reason: 'truncating-integer-division',
    });
  });

  it('refuses it however the dividend is spelled', () => {
    for (const formula of [
      `(${ref('a')}+${ref('b')})/100`,
      `${ref('a')}*2/100`,
      `SAFE_DIVIDE(${ref('a')},100)`,
    ]) {
      expect([formula, liftInteger(formula)]).toEqual([
        formula,
        { formula: null, reason: 'truncating-integer-division' },
      ]);
    }
  });

  it('refuses the feature’s own headline ratio on a truncating storage', () => {
    // Rows (5,2) and (1,3) already display 2 and 0 where `/` truncates, so
    // `SUM(clicks)/SUM(impressions)` = 1 is a moved number. Exact on a promoting storage, which is
    // why the fact is storage-aware.
    const rows = [
      { clicks: 5, impressions: 2 },
      { clicks: 1, impressions: 3 },
    ];
    const truncatedRowValues = rows.map(row => Math.trunc(row.clicks / row.impressions));
    const liftedAnswer = Math.trunc(
      rows.reduce((total, row) => total + row.clicks, 0) /
        rows.reduce((total, row) => total + row.impressions, 0)
    );
    expect([truncatedRowValues, liftedAnswer]).toEqual([[2, 0], 1]);

    expect(liftInteger(`${ref('clicks')}/${ref('impressions')}`)).toEqual({
      formula: null,
      reason: 'truncating-integer-division',
    });
    expect(liftInteger(`SAFE_DIVIDE(${ref('clicks')},${ref('impressions')})`)).toEqual({
      formula: null,
      reason: 'truncating-integer-division',
    });
    // The same formula, on a storage whose `/` promotes to a float.
    expect(
      liftFormulaToGroupLevel(
        `${ref('clicks')}/${ref('impressions')}`,
        anyReference,
        isUniversalAggregateFunction
      )
    ).toEqual({ formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` });
  });

  it('leaves a truncating reference alone where nothing divides it', () => {
    expect(liftInteger(`${ref('revenue')}-${ref('cost')}`)).toEqual({
      formula: `SUM(${ref('revenue')}-${ref('cost')}\n)`,
    });
    expect(liftInteger(`${ref('amount')}*1.2`)).toEqual({ formula: `SUM(${ref('amount')}*1.2\n)` });
  });
});

describe('liftFormulaToGroupLevel — every accepted lift, evaluated', () => {
  // The guard's claim is arithmetic, so the test is too: asserting the rewritten text alone is
  // what lets a wrong answer ship green. Each accepted formula is evaluated over real rows.
  const rows = [
    { clicks: 2, impressions: 8, revenue: 30, cost: 12, amount: 1.5 },
    { clicks: 6, impressions: 24, revenue: 50, cost: 20, amount: 2.5 },
    { clicks: 4, impressions: 8, revenue: 20, cost: 8, amount: 4 },
  ];
  type Row = (typeof rows)[number];
  const columnTotal = (field: string) =>
    rows.reduce((total, row) => total + row[field as keyof Row], 0);

  // `SUM` is the identity here because the references are already substituted with their totals.
  const evaluate = (text: string, valueOf: (field: string) => number): number => {
    const arithmetic = renderFormula(text, reference => `(${valueOf(reference.field)})`);
    const compiled = new Function('SUM', 'NULLIF', 'SAFE_DIVIDE', `return (${arithmetic});`) as (
      sum: (value: number) => number,
      nullif: (value: number, blank: number) => number,
      safeDivide: (dividend: number, divisor: number) => number
    ) => number;
    return compiled(
      value => value,
      (value, blank) => (value === blank ? NaN : value),
      (dividend, divisor) => (divisor === 0 ? NaN : dividend / divisor)
    );
  };
  const round = (value: number) => Math.round(value * 1e9) / 1e9;

  /**
   * `additive` — degree 1, so `Σ f(row) === f(Σ rows)`. `ratio` — degree 0, so the lift is
   * unchanged when every row is duplicated, the fan-out invariance this feature exists for.
   * `1/{{sessions}}` (degree -1) and `q/(1/p)` (degree 2) each fail one of the two.
   */
  const ACCEPTED: readonly { formula: string; degree: 'additive' | 'ratio' }[] = [
    { formula: ref('clicks'), degree: 'additive' },
    { formula: `${ref('revenue')}-${ref('cost')}`, degree: 'additive' },
    { formula: `${ref('revenue')}+${ref('cost')}`, degree: 'additive' },
    { formula: `${ref('amount')}*1.2`, degree: 'additive' },
    { formula: `1.2*${ref('amount')}`, degree: 'additive' },
    { formula: `${ref('amount')}/100`, degree: 'additive' },
    { formula: `${ref('amount')}*(1+0.2)`, degree: 'additive' },
    { formula: `${ref('revenue')}*2-${ref('cost')}*3`, degree: 'additive' },
    { formula: `-${ref('cost')}`, degree: 'additive' },
    { formula: `${ref('clicks')}/${ref('impressions')}`, degree: 'ratio' },
    { formula: `(${ref('revenue')}+${ref('cost')})/${ref('clicks')}`, degree: 'ratio' },
    { formula: `${ref('clicks')}/(${ref('clicks')}+${ref('impressions')})`, degree: 'ratio' },
    { formula: `${ref('revenue')}/NULLIF(${ref('cost')},0)`, degree: 'ratio' },
    { formula: `SAFE_DIVIDE(${ref('clicks')},${ref('impressions')})`, degree: 'ratio' },
    { formula: `SAFE_DIVIDE(${ref('clicks')},NULLIF(${ref('impressions')},0))`, degree: 'ratio' },
    { formula: `${ref('clicks')}*100/${ref('impressions')}`, degree: 'ratio' },
    { formula: `${ref('clicks')}*1.5/${ref('impressions')}`, degree: 'ratio' },
  ];

  it.each(ACCEPTED)('$degree: $formula', ({ formula, degree }) => {
    const result = liftFormulaToGroupLevel(formula, anyReference, isUniversalAggregateFunction);
    expect([formula, result]).toEqual([formula, { formula: expect.any(String) }]);
    const lifted = (result as { formula: string }).formula;

    const liftedValue = evaluate(lifted, columnTotal);
    expect(Number.isFinite(liftedValue)).toBe(true);

    if (degree === 'additive') {
      const perRowTotal = rows.reduce(
        (total, row) => total + evaluate(formula, field => row[field as keyof Row]),
        0
      );
      expect([formula, round(liftedValue)]).toEqual([formula, round(perRowTotal)]);
      return;
    }
    // Duplicating every row doubles every column total and must not move a ratio.
    const doubled = evaluate(lifted, field => columnTotal(field) * 2);
    expect([formula, round(liftedValue)]).toEqual([formula, round(doubled)]);
  });

  // Derived from the text, not the guard, so the expectation cannot drift with the rules it
  // checks.
  const divides = (formula: string) => formula.includes('/') || formula.includes('SAFE_DIVIDE(');

  it.each(ACCEPTED)('under a truncating storage: $formula', ({ formula }) => {
    const result = liftFormulaToGroupLevel(
      formula,
      truncatingReference,
      isUniversalAggregateFunction
    );
    if (divides(formula)) {
      expect([formula, result]).toEqual([
        formula,
        { formula: null, reason: 'truncating-integer-division' },
      ]);
      return;
    }
    // No division, so nothing truncates and the shape lifts exactly as it does elsewhere.
    expect([formula, result]).toEqual([formula, { formula: expect.any(String) }]);
  });

  it('would have caught the two shapes that leaked, had they been accepted', () => {
    // `1/sessions` fails additivity (0.75 vs 0.167) and `q/(1/p)` fails the ratio property
    // (doubling the rows quadruples it). Asserted against the shapes, so the properties stay
    // pinned even if the guard changes.
    const sessions = [2, 4];
    const perRow = sessions.reduce((total, value) => total + 1 / value, 0);
    const lifted = 1 / sessions.reduce((total, value) => total + value, 0);
    expect([round(perRow), round(lifted)]).toEqual([0.75, round(1 / 6)]);

    const totals = { quantity: 3, unitPrice: 8 };
    const ratioLike = (q: number, p: number) => q / (1 / p);
    expect(ratioLike(totals.quantity * 2, totals.unitPrice * 2)).toBe(
      ratioLike(totals.quantity, totals.unitPrice) * 4
    );
  });
});

describe('liftFormulaToGroupLevel — every shape the guard accepts, swept', () => {
  // The table above says which shapes we mean to support; this says the guard accepts nothing else
  // that misbehaves. Formulas are enumerated mechanically and classified by numeric behaviour, so
  // widening `LIFTABLE_PUNCTUATION` or `LIFTABLE_FUNCTIONS` re-runs it with no list to update.
  const A = ref('a');
  const B = ref('b');
  const leaves = [A, B, '2', '1.5'];
  const signed = leaves.flatMap(leaf => [leaf, `-${leaf}`]);
  const binary = ['+', '-', '*', '/'];

  const enumerate = (): string[] => {
    const bracketed: string[] = [];
    for (const left of signed) {
      for (const right of signed) {
        for (const op of binary) bracketed.push(`(${left}${op}${right})`);
      }
    }
    const level1 = [...signed, ...bracketed];
    const all = [...level1];
    for (const left of level1) {
      for (const right of leaves) {
        for (const op of binary) all.push(`${left}${op}${right}`);
      }
    }
    for (const inner of level1) {
      all.push(`SAFE_DIVIDE(${inner},${B})`, `${A}/NULLIF(${inner},0)`, `NULLIF(${inner},0)`);
    }
    return all;
  };

  const rows = [
    { a: 3, b: 5 },
    { a: 7, b: 11 },
    { a: 2, b: 13 },
  ];
  type Row = (typeof rows)[number];
  const total = (field: string) => rows.reduce((sum, row) => sum + row[field as keyof Row], 0);

  const evaluate = (text: string, valueOf: (field: string) => number): number => {
    const arithmetic = renderFormula(text, reference => `(${valueOf(reference.field)})`);
    const compiled = new Function('SUM', 'NULLIF', 'SAFE_DIVIDE', `return (${arithmetic});`) as (
      sum: (value: number) => number,
      nullif: (value: number, blank: number) => number,
      safeDivide: (dividend: number, divisor: number) => number
    ) => number;
    return compiled(
      value => value,
      (value, blank) => (value === blank ? NaN : value),
      (dividend, divisor) => (divisor === 0 ? NaN : dividend / divisor)
    );
  };
  const close = (x: number, y: number) =>
    Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));

  it('accepts only shapes that are additive or fan-out invariant', () => {
    const misbehaving: string[] = [];
    let checked = 0;

    for (const formula of enumerate()) {
      const result = liftFormulaToGroupLevel(formula, anyReference, isUniversalAggregateFunction);
      if (result.formula === null) continue;

      const atTotals = evaluate(result.formula, total);
      const atDoubleTotals = evaluate(result.formula, field => total(field) * 2);
      const perRowTotal = rows.reduce(
        (sum, row) => sum + evaluate(formula, field => row[field as keyof Row]),
        0
      );
      // A zero denominator somewhere in the fixture says nothing about the shape.
      if (![atTotals, atDoubleTotals, perRowTotal].every(Number.isFinite)) continue;
      checked++;

      // Degree 1 (`f(2T) = 2f(T)`) must be additive; degree 0 (`f(2T) = f(T)`) is the fan-out
      // invariant ratio. Any other degree is a shape the lift must not accept.
      if (close(atDoubleTotals, 2 * atTotals)) {
        if (!close(perRowTotal, atTotals)) misbehaving.push(`${formula} (Σf(row) ≠ f(ΣT))`);
      } else if (!close(atDoubleTotals, atTotals)) {
        misbehaving.push(`${formula} (neither degree 1 nor degree 0)`);
      }
    }

    expect(misbehaving).toEqual([]);
    // A floor, so the sweep cannot quietly become vacuous if the generator or the guard changes.
    expect(checked).toBeGreaterThan(200);
  });

  it('can only ever refuse MORE once dividing a reference truncates', () => {
    // Monotonicity: truncation is a refusal input, so whatever it accepts the non-truncating run
    // must accept too, rewritten identically. A division between two literals — `(2/2)*{{a}}` — is
    // a constant either way and rightly survives.
    const inconsistent: string[] = [];
    for (const formula of enumerate()) {
      const truncating = liftFormulaToGroupLevel(
        formula,
        truncatingReference,
        isUniversalAggregateFunction
      );
      if (truncating.formula === null) continue;
      const permissive = liftFormulaToGroupLevel(
        formula,
        anyReference,
        isUniversalAggregateFunction
      );
      if (permissive.formula !== truncating.formula) inconsistent.push(formula);
    }
    expect(inconsistent).toEqual([]);
  });
});
