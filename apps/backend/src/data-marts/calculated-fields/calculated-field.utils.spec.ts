import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { CalculatedFieldPlan } from '../data-storage-types/utils/sql-clause-renderer';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
  brokenReferencesOf,
  calculatedDependencyPlans,
  calculatedFieldLevelOf,
  CalculatedSchemaField,
  collectCollidingCalculatedFieldNames,
  columnFilterWithoutCalculatedFields,
  isAggregateCalculatedField,
  isRowLevelCalculatedField,
} from './calculated-field.utils';

const mkField = (name: string, extra: Partial<DataMartSchemaField> = {}): DataMartSchemaField =>
  ({
    name,
    type: 'STRING',
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...extra,
  }) as unknown as DataMartSchemaField;

const mkCalculated = (
  name: string,
  formula: string,
  level: 'metric' | 'column' = 'metric'
): CalculatedSchemaField =>
  ({
    name,
    type: 'FLOAT',
    status: DataMartSchemaFieldStatus.CONNECTED,
    calculated: { formula, level },
  }) as unknown as CalculatedSchemaField;

const ref = (name: string) => `{{ref field="${name}"}}`;

describe('the level predicates', () => {
  const withLevel = (level?: string) =>
    ({ calculated: { formula: 'SUM({{ref field="clicks"}})', level } }) as unknown as Pick<
      DataMartSchemaField,
      'calculated'
    >;

  it('reads only level "column" as row-level', () => {
    expect(isRowLevelCalculatedField(withLevel('column'))).toBe(true);
    expect(isAggregateCalculatedField(withLevel('column'))).toBe(false);
  });

  it('reads level "metric" as an aggregate', () => {
    expect(isAggregateCalculatedField(withLevel('metric'))).toBe(true);
    expect(isRowLevelCalculatedField(withLevel('metric'))).toBe(false);
  });

  // The wire accepts a calculated field with no level, and every such field behaved as an
  // aggregate before this slice existed — so absence must keep reading that way, not become a
  // third state each caller invents an answer for.
  it('reads an absent level as an aggregate, the pre-existing behaviour', () => {
    expect(isAggregateCalculatedField(withLevel())).toBe(true);
    expect(isRowLevelCalculatedField(withLevel())).toBe(false);
  });

  // Both predicates answer a question ABOUT A FORMULA. A plain warehouse column has none, so
  // neither may claim it — `isCalculatedField` is the predicate that keeps the other meaning.
  it('says nothing about a field with no formula', () => {
    expect(isAggregateCalculatedField(mkField('clicks'))).toBe(false);
    expect(isRowLevelCalculatedField(mkField('clicks'))).toBe(false);
  });
});

// The level decides the GROUP BY, and the persisted one is a CACHE. Every case
// below is a formula whose own token stream holds no aggregate at all, so reading `calculated.level`
// (or re-deriving from A's own text) answers 'column' — a row-level dimension — and the report
// silently collapses to a grand total with no error and no log line.
describe('calculatedFieldLevelOf', () => {
  it('reads a field whose own persisted level aggregates as a metric', () => {
    const roas = mkCalculated('roas', 'SUM({{ref field="revenue"}})', 'metric');

    expect(calculatedFieldLevelOf(roas, [mkField('revenue'), roas])).toBe('metric');
  });

  it('leaves a row-level field row-level when nothing it reads aggregates', () => {
    const fullName = mkCalculated('full_name', `CONCAT(${ref('first')}, ${ref('last')})`, 'column');

    expect(calculatedFieldLevelOf(fullName, [mkField('first'), mkField('last'), fullName])).toBe(
      'column'
    );
  });

  // THE stale cache. `roas` was saved while `revenue` was row-level, `revenue` later became an
  // aggregate through a path that does not run the validator, and nothing rewrote `roas`'s level.
  // Kills "return isRowLevelCalculatedField(field) ? 'column' : 'metric'".
  it('reports metric when a referenced calculated field aggregates, whatever the persisted level says', () => {
    const revenue = mkCalculated('revenue', 'SUM({{ref field="amount"}})', 'metric');
    const cost = mkCalculated('cost', 'SUM({{ref field="spend"}})', 'metric');
    const roas = mkCalculated('roas', `${ref('revenue')} / ${ref('cost')}`, 'column');

    expect(
      calculatedFieldLevelOf(roas, [mkField('amount'), mkField('spend'), revenue, cost, roas])
    ).toBe('metric');
  });

  // The base case is a cache too. `revenue` plainly aggregates in its own text, and every
  // supported dialect calls SUM an aggregate — so the recorded 'column' cannot be what decides it.
  // Kills "if (isAggregateLevel(field.calculated.level)) return 'metric'" as the only own-text rule.
  it('reads a field’s own formula text, not its persisted level, when the two disagree', () => {
    const revenue = mkCalculated('revenue', 'SUM({{ref field="amount"}})', 'column');

    expect(calculatedFieldLevelOf(revenue, [mkField('amount'), revenue])).toBe('metric');
  });

  // The same cache, one hop down — the reviewer's executed case. Both leaves are recorded
  // row-level and both really aggregate, so a walk that asks the chain's persisted levels answers
  // 'column' for `roas`: it becomes a GROUP BY key and the report collapses, no error. Kills
  // "if (isAggregateCalculatedField(dependency)) return true".
  it('reads a DEPENDENCY’s formula text when its persisted level is stale-low', () => {
    const revenue = mkCalculated('revenue', 'SUM({{ref field="amount"}})', 'column');
    const cost = mkCalculated('cost', 'SUM({{ref field="spend"}})', 'column');
    const roas = mkCalculated('roas', `${ref('revenue')} / ${ref('cost')}`, 'column');

    expect(
      calculatedFieldLevelOf(roas, [mkField('amount'), mkField('spend'), revenue, cost, roas])
    ).toBe('metric');
  });

  // An aggregate call inside a comment is not SQL, so it must not be what upgrades a dimension —
  // the same live-only reading every other reader of a stored formula uses.
  it('does not read an aggregate call inside a SQL comment as aggregating', () => {
    const label = mkCalculated('label', `${ref('x')} -- SUM(${ref('y')})`, 'column');

    expect(calculatedFieldLevelOf(label, [mkField('x'), mkField('y'), label])).toBe('column');
  });

  // The text rule only recognises what EVERY dialect agrees is an aggregate, which is what makes it
  // safe to apply without knowing the storage. A dialect-specific spelling is still answered from
  // the recorded level — the one direction that can only ever upgrade. Pinned deliberately: this is
  // the residual, and a reader should see it rather than infer the seat is fully dialect-free.
  it('still trusts a recorded aggregate level for a spelling only some dialects call an aggregate', () => {
    const sellers = mkCalculated('sellers', 'LISTAGG({{ref field="name"}})', 'metric');
    const shouted = mkCalculated('shouted', `${ref('sellers')} || '!'`, 'column');

    expect(calculatedFieldLevelOf(shouted, [mkField('name'), sellers, shouted])).toBe('metric');
  });

  // Kills "look only one hop down": every level in the chain claims to be row-level, and only the
  // third one's formula actually aggregates.
  it('follows the chain past a row-level intermediate', () => {
    const base = mkCalculated('base', 'SUM({{ref field="amount"}})', 'metric');
    const middle = mkCalculated('middle', `${ref('base')} * 2`, 'column');
    const top = mkCalculated('top', `${ref('middle')} + 1`, 'column');

    expect(calculatedFieldLevelOf(top, [mkField('amount'), base, middle, top])).toBe('metric');
  });

  // A schema written by a path that skips the validator can hold a loop. Answering it is not this
  // function's job — surviving it is; the renderer refuses the loop by name.
  it('does not hang on a cycle', () => {
    const a = mkCalculated('a', ref('b'), 'column');
    const b = mkCalculated('b', ref('a'), 'column');

    expect(calculatedFieldLevelOf(a, [a, b])).toBe('column');
  });

  // Kills "read every reference": a commented-out tag is not SQL, exactly as everywhere else this
  // feature reads references, so it must not be what makes a dimension aggregate.
  it('ignores a reference that sits inside a SQL comment', () => {
    const revenue = mkCalculated('revenue', 'SUM({{ref field="amount"}})', 'metric');
    const label = mkCalculated('label', `'x' -- ${ref('revenue')}`, 'column');

    expect(calculatedFieldLevelOf(label, [mkField('amount'), revenue, label])).toBe('column');
  });

  // A joined Data Mart's calculated field is refused outright and is never substituted, so it
  // cannot be what makes this formula a metric either.
  it('ignores a joined reference', () => {
    const roas = mkCalculated('roas', '{{ref path="orders" field="revenue"}} / 2', 'column');

    expect(calculatedFieldLevelOf(roas, [roas])).toBe('column');
  });

  // A NESTED calculated field is not a formula target: `calculatedFieldsOf` never sees one, so no
  // plan can substitute it, and `DataMartSchemaParserFacade` refuses that schema shape on every
  // save path. `brokenReferencesOf` reports the reference instead of this silently upgrading a level.
  it('does not treat a nested calculated field as a dependency', () => {
    const nested = mkCalculated('child', 'SUM({{ref field="amount"}})', 'metric');
    const parent = {
      name: 'parent',
      type: 'RECORD',
      status: DataMartSchemaFieldStatus.CONNECTED,
      fields: [nested],
    } as unknown as DataMartSchemaField;
    const roas = mkCalculated('roas', `${ref('parent.child')} / 2`, 'column');

    expect(calculatedFieldLevelOf(roas, [parent, roas])).toBe('column');
  });
});

// A dependency enters the plan set to be SUBSTITUTED, never to be projected. The closure is
// flat and deduped so nothing here can build a cyclic object graph out of a cyclic schema.
describe('calculatedDependencyPlans', () => {
  // `undefined`, not `[]`: a plan for a formula that reads only columns must stay byte-identical
  // to what it was before this feature — several exact-object assertions downstream depend on it.
  it('returns nothing when a formula reads only ordinary columns', () => {
    const ctr = mkCalculated('ctr', `SUM(${ref('clicks')})`);

    expect(calculatedDependencyPlans(ctr, [mkField('clicks'), ctr])).toBeUndefined();
  });

  // Kills "plan only the fields the report selected": the report selects `roas` alone, and without
  // these two plans the renderer has nothing to substitute at either reference.
  it('plans every calculated field the formula reads', () => {
    const revenue = mkCalculated('revenue', `SUM(${ref('amount')})`);
    const cost = mkCalculated('cost', `SUM(${ref('spend')})`);
    const roas = mkCalculated('roas', `${ref('revenue')} / ${ref('cost')}`);
    const schema = [mkField('amount'), mkField('spend'), revenue, cost, roas];

    expect(calculatedDependencyPlans(roas, schema)!.map(p => p.outputName)).toEqual([
      'revenue',
      'cost',
    ]);
  });

  // Kills "one hop only" — the closure is TRANSITIVE, and `base` is reachable only through `middle`.
  it('closes over the whole chain, not just the first hop', () => {
    const base = mkCalculated('base', `SUM(${ref('amount')})`);
    const middle = mkCalculated('middle', `${ref('base')} * 2`);
    const top = mkCalculated('top', `${ref('middle')} + 1`);

    expect(
      calculatedDependencyPlans(top, [mkField('amount'), base, middle, top])!.map(p => p.outputName)
    ).toEqual(['middle', 'base']);
  });

  // A diamond is legal, and the closure is a SET: two references to the same field are one plan.
  it('names a field read twice exactly once', () => {
    const shared = mkCalculated('shared', `SUM(${ref('amount')})`);
    const left = mkCalculated('left', `${ref('shared')} + 1`);
    const right = mkCalculated('right', `${ref('shared')} + 2`);
    const top = mkCalculated('top', `${ref('left')} / ${ref('right')}`);

    expect(
      calculatedDependencyPlans(top, [mkField('amount'), shared, left, right, top])!.map(
        p => p.outputName
      )
    ).toEqual(['left', 'shared', 'right']);
  });

  // The closure must still CARRY the field that closes a loop, or the reference falls through to
  // the plain column resolver and renders `main."a"` — a wrong column, silently. Kills
  // "stop building at a name already on the stack".
  it('carries the field that closes a cycle, so the renderer can refuse it by name', () => {
    const a = mkCalculated('a', ref('b'));
    const b = mkCalculated('b', ref('a'));

    expect(calculatedDependencyPlans(a, [a, b])!.map(p => p.outputName)).toEqual(['b', 'a']);
  });

  it('survives an unparseable dependency without throwing', () => {
    const broken = mkCalculated('broken', 'SUM({{ref field="x"}} / {{#if y}}');
    const top = mkCalculated('top', `${ref('broken')} + 1`);

    expect(() => calculatedDependencyPlans(top, [broken, top])).not.toThrow();
  });

  // A dependency is not a column, so it carries no header material at all — `alias`/`description`
  // are the metric's only header source, and a plan holding them is one step from being projected.
  it('gives a dependency no header material', () => {
    const revenue = {
      ...mkCalculated('revenue', `SUM(${ref('amount')})`),
      alias: 'Revenue, $',
      description: 'net revenue',
    } as unknown as CalculatedSchemaField;
    const roas = mkCalculated('roas', `${ref('revenue')} / 2`);

    expect(calculatedDependencyPlans(roas, [mkField('amount'), revenue, roas])).toEqual([
      {
        outputName: 'revenue',
        type: 'FLOAT',
        formula: revenue.calculated.formula,
        level: 'metric',
      },
    ]);
  });
});

describe('brokenReferencesOf', () => {
  it('returns empty when every reference resolves to a real field', () => {
    const ctr = mkCalculated(
      'ctr',
      'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)'
    );
    const schemaFields = [mkField('clicks'), mkField('impressions'), ctr];

    expect(brokenReferencesOf(ctr, schemaFields)).toEqual([]);
  });

  it('flags a reference to a field absent from the schema entirely', () => {
    const ctr = mkCalculated('ctr', 'SUM({{ref field="clicks"}}) / {{ref field="impressions"}}');
    const schemaFields = [mkField('clicks'), ctr];

    expect(brokenReferencesOf(ctr, schemaFields)).toEqual(['impressions']);
  });

  it('flags a reference to a field the warehouse actualization dropped (DISCONNECTED)', () => {
    const ctr = mkCalculated('ctr', 'SUM({{ref field="clicks"}}) / {{ref field="impressions"}}');
    const schemaFields = [
      mkField('clicks'),
      mkField('impressions', { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      ctr,
    ];

    expect(brokenReferencesOf(ctr, schemaFields)).toEqual(['impressions']);
  });

  // INVERTED: a reference to a calculated field is no longer broken FOR BEING ONE — that
  // is the whole feature. What it is now is TRANSITIVE: `ctr` is only as usable as `clicks`'s own
  // chain, and `raw_clicks` is the column that actually went missing. Kills "keep reporting the
  // calculated target itself", which would name a field that is right there in the schema.
  it('reports what a referenced calculated field is missing, not the reference to it', () => {
    const ctr = mkCalculated('ctr', 'SUM({{ref field="clicks"}}) / {{ref field="impressions"}}');
    const clicksNowCalculated = mkCalculated('clicks', '{{ref field="raw_clicks"}}');
    const schemaFields = [clicksNowCalculated, mkField('impressions'), ctr];

    expect(brokenReferencesOf(ctr, schemaFields)).toEqual(['raw_clicks']);
  });

  it('clears a reference to a calculated field whose own chain resolves', () => {
    const revenue = mkCalculated('revenue', 'SUM({{ref field="amount"}})');
    const cost = mkCalculated('cost', 'SUM({{ref field="spend"}})');
    const roas = mkCalculated('roas', '{{ref field="revenue"}} / {{ref field="cost"}}');

    expect(
      brokenReferencesOf(roas, [mkField('amount'), mkField('spend'), revenue, cost, roas])
    ).toEqual([]);
  });

  // The chain, not one hop: `base` is reachable only through `middle`, and it is what is broken.
  it('follows a chain of calculated fields to the column that is actually gone', () => {
    const base = mkCalculated('base', 'SUM({{ref field="amount"}})');
    const middle = mkCalculated('middle', '{{ref field="base"}} * 2');
    const top = mkCalculated('top', '{{ref field="middle"}} + 1');

    expect(brokenReferencesOf(top, [base, middle, top])).toEqual(['amount']);
  });

  // A dependency whose own formula cannot be parsed is reported BY NAME — it is genuinely the
  // reason `top` cannot be computed, and it is not "gone from the Data Mart" (the message the
  // consumers used to spell, which this case is what corrects).
  it('reports a dependency whose own formula is unparseable, by that dependency name', () => {
    const broken = mkCalculated('broken', 'SUM({{ref field="x"}} / {{#if y}}');
    const top = mkCalculated('top', '{{ref field="broken"}} + 1');

    expect(brokenReferencesOf(top, [mkField('x'), broken, top])).toEqual(['broken']);
  });

  // A loop reaches here from a schema written by a path that skips save-time validation. Reporting
  // it is the renderer's job (it refuses by name); not hanging the blendable-schema endpoint is this
  // one's. Kills "recurse without a visited set".
  it('does not hang on a cycle between two formulas', () => {
    const a = mkCalculated('a', '{{ref field="b"}}');
    const b = mkCalculated('b', '{{ref field="a"}}');

    expect(brokenReferencesOf(a, [a, b])).toEqual([]);
  });

  // A NESTED calculated field is not a formula target — no plan can substitute one, and the schema
  // parser refuses that shape on every save path — so a reference to one is broken, not resolved.
  it('flags a reference to a calculated field nested inside a RECORD', () => {
    const nested = mkCalculated('child', 'SUM({{ref field="amount"}})');
    const parent = {
      name: 'parent',
      type: 'RECORD',
      status: DataMartSchemaFieldStatus.CONNECTED,
      fields: [nested],
    } as unknown as DataMartSchemaField;
    const roas = mkCalculated('roas', '{{ref field="parent.child"}} / 2');

    expect(brokenReferencesOf(roas, [parent, roas])).toEqual(['parent.child']);
  });

  it('does not flag a reference to a field the reporting menu merely hides', () => {
    const hiddenRatio = mkCalculated(
      'hidden_ratio',
      'SUM({{ref field="internal_clicks"}}) / {{ref field="impressions"}}'
    );
    const schemaFields = [
      mkField('internal_clicks', { isHiddenForReporting: true }),
      mkField('impressions'),
      hiddenRatio,
    ];

    expect(brokenReferencesOf(hiddenRatio, schemaFields)).toEqual([]);
  });

  it('does not flag a bare unique_count token when no real field owns that name', () => {
    const shareOfTotal = mkCalculated(
      'share_of_total',
      '{{ref field="clicks"}} / {{ref field="unique_count"}}'
    );
    const schemaFields = [mkField('clicks'), shareOfTotal];

    expect(brokenReferencesOf(shareOfTotal, schemaFields)).toEqual([]);
  });

  it('resolves unique_count through a REAL calculated field of that name — the real field shadows the token', () => {
    // A real, CONNECTED "unique_count" field shadows the synthetic token (mirrors the save-time
    // reading: `found` wins before the token fallback is ever consulted). A calculated
    // field of that name is a legal target, so what decides the verdict is ITS chain — and the
    // assertion is that the chain was walked at all: had the synthetic-token reading won instead,
    // `gone` would never have been looked at and this would come back empty.
    const shareOfTotal = mkCalculated(
      'share_of_total',
      '{{ref field="clicks"}} / {{ref field="unique_count"}}'
    );
    const uniqueCountNowCalculated = mkCalculated('unique_count', '{{ref field="gone"}}');
    const schemaFields = [mkField('clicks'), uniqueCountNowCalculated, shareOfTotal];

    expect(brokenReferencesOf(shareOfTotal, schemaFields)).toEqual(['gone']);
  });

  it('reads a DISCONNECTED field literally named unique_count as the synthetic token again, not as broken', () => {
    // `collectFormulaReferenceableFields` prunes a DISCONNECTED field the same as an absent one
    // (isConnected), so once the real column is gone it drops out of consideration entirely and
    // the bare token reading takes back over — the SAME resolution save-time validation gives it.
    const shareOfTotal = mkCalculated(
      'share_of_total',
      '{{ref field="clicks"}} / {{ref field="unique_count"}}'
    );
    const schemaFields = [
      mkField('clicks'),
      mkField('unique_count', { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      shareOfTotal,
    ];

    expect(brokenReferencesOf(shareOfTotal, schemaFields)).toEqual([]);
  });

  it('skips a joined reference (ref.path set) — own-Data-Mart references only', () => {
    const joined = mkCalculated('cross_dm_ratio', '{{ref path="orders" field="revenue"}}');

    expect(brokenReferencesOf(joined, [joined])).toEqual([]);
  });

  // `brokenJoinedReferencesOf` has always read LIVE references only, and the two halves share one
  // `missing` array on one hard-blocking channel — so a commented-out OWN reference greying the
  // metric out made the rule look arbitrary from the analyst's side.
  it('ignores a reference that sits inside a SQL comment', () => {
    const ctr = mkCalculated(
      'ctr',
      'SUM({{ref field="clicks"}})\n-- was {{ref field="impressions"}}\n/* {{ref field="gone"}} */'
    );

    expect(brokenReferencesOf(ctr, [mkField('clicks'), ctr])).toEqual([]);
  });

  it('names every broken reference, not just the first', () => {
    const ctr = mkCalculated('ctr', '{{ref field="clicks"}} / {{ref field="impressions"}}');

    expect(brokenReferencesOf(ctr, [ctr])).toEqual(['clicks', 'impressions']);
  });

  // This runs on every `computeBlendableSchema`, i.e. on the endpoint the report editor opens
  // with. An unparseable persisted formula (hand-written API call, or a row written before the
  // save-time validator existed) must degrade to "broken" — letting the parse error escape turned
  // one bad formula into a 500 for the whole schema, with no way to reach the editor that fixes it.
  it('reports an unparseable stored formula as broken instead of throwing', () => {
    const broken = mkCalculated('ctr', 'SUM({{ref field="clicks"}} / {{#if x}}');

    expect(() => brokenReferencesOf(broken, [broken])).not.toThrow();
    expect(brokenReferencesOf(broken, [broken])).toEqual(['ctr']);
  });
});

describe('columnFilterWithoutCalculatedFields', () => {
  const plan = (outputName: string): CalculatedFieldPlan => ({
    outputName,
    type: 'FLOAT',
    formula: '…',
    level: 'metric',
  });

  it('drops every selected metric name from the filter, in place', () => {
    expect(
      columnFilterWithoutCalculatedFields(
        ['country', 'ctr', 'clicks', 'roas'],
        [plan('ctr'), plan('roas')]
      )
    ).toEqual(['country', 'clicks']);
  });

  it('returns the filter untouched when the plan carries no metric', () => {
    const filter = ['country', 'clicks'];

    expect(columnFilterWithoutCalculatedFields(filter, [])).toBe(filter);
    expect(columnFilterWithoutCalculatedFields(filter, undefined)).toBe(filter);
  });

  // "No projection" and "an empty projection" are DIFFERENT to the header resolver — undefined
  // falls back to every native header, `[]` means metrics-only — so the distinction has to
  // survive this helper untouched.
  it('preserves the undefined / empty distinction of the filter itself', () => {
    expect(columnFilterWithoutCalculatedFields(undefined, [plan('ctr')])).toBeUndefined();
    expect(columnFilterWithoutCalculatedFields([], [plan('ctr')])).toEqual([]);
  });
});

describe('collectCollidingCalculatedFieldNames', () => {
  it('reports a calculated field sharing a name with a physical column', () => {
    expect(
      collectCollidingCalculatedFieldNames([
        mkField('revenue'),
        mkCalculated('revenue', 'SUM({{ref field="amount"}})'),
      ])
    ).toEqual(['revenue']);
  });

  // The byte-exact check let this pair through, and the warehouses then disagreed: Redshift folds
  // delimited identifiers and Athena and Databricks resolve case-insensitively, so the result set
  // carries two columns of one name and every reader keeps one of them — silently. BigQuery
  // refuses the query outright. One defect, loud on one dialect and quiet on three.
  it('reports a collision that differs only in case', () => {
    expect(
      collectCollidingCalculatedFieldNames([
        mkField('Revenue'),
        mkCalculated('revenue', 'SUM({{ref field="amount"}})'),
      ])
    ).toEqual(['revenue']);
  });

  it('reports two calculated fields colliding only in case', () => {
    expect(
      collectCollidingCalculatedFieldNames([
        mkCalculated('Margin', 'SUM({{ref field="a"}})'),
        mkCalculated('margin', 'SUM({{ref field="b"}})'),
      ])
    ).toEqual(['Margin', 'margin']);
  });

  it('leaves distinct names alone', () => {
    expect(
      collectCollidingCalculatedFieldNames([
        mkField('revenue'),
        mkCalculated('margin', 'SUM({{ref field="amount"}})'),
      ])
    ).toEqual([]);
  });

  // Two PHYSICAL columns colliding is the warehouse's business and predates this feature — the
  // check must not start reporting a schema it never owned.
  it('ignores a collision between two physical columns', () => {
    expect(collectCollidingCalculatedFieldNames([mkField('Revenue'), mkField('revenue')])).toEqual(
      []
    );
  });
});
