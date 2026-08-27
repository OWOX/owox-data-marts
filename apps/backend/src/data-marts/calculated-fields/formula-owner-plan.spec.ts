import { buildFormulaOwnerPlan } from './formula-owner-plan';

const AGG = (n: string) => ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(n.toUpperCase());
const own = (f: string) => `{{ref field="${f}"}}`;
const joined = (p: string, f: string) => `{{ref path="${p}" field="${f}"}}`;

describe('buildFormulaOwnerPlan', () => {
  it('routes an own-Data-Mart call to the own owner', () => {
    const { plan, violations } = buildFormulaOwnerPlan(`SUM(${own('cost')}) * 2`, AGG);
    expect(violations).toEqual([]);
    expect(plan.hasJoinedCall).toBe(false);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].owner).toEqual({ kind: 'own' });
    expect(plan.calls[0].fn).toBe('SUM');
  });

  it('routes each call to its own owner in a mixed formula', () => {
    const stored = `Sum(${own('cost')}) * 2 * SUM(${joined('orders', 'amount')})`;
    const { plan, violations } = buildFormulaOwnerPlan(stored, AGG);
    expect(violations).toEqual([]);
    expect(plan.hasJoinedCall).toBe(true);
    expect(plan.calls.map(c => c.owner)).toEqual([
      { kind: 'own' },
      { kind: 'joined', aliasPath: 'orders' },
    ]);
  });

  it('refuses a call whose references span two owners', () => {
    const stored = `SUM(${own('cost')} * ${joined('orders', 'amount')})`;
    const { violations } = buildFormulaOwnerPlan(stored, AGG);
    expect(violations).toEqual([{ kind: 'mixed-owner-call', fn: 'SUM', paths: ['', 'orders'] }]);
  });

  it('attributes a reference to the INNERMOST aggregate call', () => {
    const stored = `SUM(${own('cost')} / AVG(${joined('orders', 'amount')}))`;
    const { plan, violations } = buildFormulaOwnerPlan(stored, AGG);
    expect(violations).toEqual([]);
    const byFn = new Map(plan.calls.map(c => [c.fn, c.owner]));
    expect(byFn.get('AVG')).toEqual({ kind: 'joined', aliasPath: 'orders' });
    expect(byFn.get('SUM')).toEqual({ kind: 'own' });
  });

  it('reports a reference that sits outside every aggregate call', () => {
    const { violations } = buildFormulaOwnerPlan(`${own('cost')} + SUM(${own('clicks')})`, AGG);
    expect(violations).toEqual([{ kind: 'ref-outside-aggregate', field: 'cost' }]);
  });

  it('spans of a call cover the parentheses, so the whole call can be replaced', () => {
    const stored = `2 * SUM(${joined('orders', 'amount')})`;
    const { plan } = buildFormulaOwnerPlan(stored, AGG);
    const c = plan.calls[0];
    expect(stored.slice(c.start, c.end)).toBe(`SUM(${joined('orders', 'amount')})`);
  });

  it('ignores a non-aggregate function call', () => {
    const stored = `NULLIF(SUM(${own('cost')}), 0)`;
    const { plan } = buildFormulaOwnerPlan(stored, AGG);
    expect(plan.calls.map(c => c.fn)).toEqual(['SUM']);
  });

  it('ignores a reference commented out inside a call, so it cannot trip mixed-owner', () => {
    const stored = `SUM(${own('cost')} /* ${joined('orders', 'amount')} */)`;
    const { plan, violations } = buildFormulaOwnerPlan(stored, AGG);
    expect(violations).toEqual([]);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].owner).toEqual({ kind: 'own' });
    expect(plan.calls[0].refs).toHaveLength(1);
  });

  it('does not report a reference inside an unclosed call as outside every aggregate call', () => {
    const stored = `SUM(${joined('orders', 'amount')}`;
    const { plan, violations } = buildFormulaOwnerPlan(stored, AGG);
    expect(violations).toEqual([]);
    expect(plan.calls).toEqual([]);
  });
});
