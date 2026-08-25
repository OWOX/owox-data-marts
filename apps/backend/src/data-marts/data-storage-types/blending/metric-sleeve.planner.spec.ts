import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
import type { RoutedFilterRule } from '../../dto/domain/filter-clause';
import { buildBlendedFieldIndex } from '../../services/blended-field-index';
import {
  createBuildContext,
  fixtureEventsUsersOrgs,
  makeChain,
  makeRelationship,
} from '../interfaces/__fixtures__/blended-query-builder-fixtures';
import type {
  BlendedFieldEntry,
  BlendedQueryContext,
} from '../interfaces/blended-query-builder.interface';
import { KEPT_GROUPS_CTE } from '../utils/kept-groups.utils';
import type { SleeveFilterOptions, ValueSleeveGroup } from './blended-query.types';
import { buildFormulaOwnerPlan } from '../../calculated-fields/formula-owner-plan';
import type {
  FormulaAggregateCall,
  FormulaOwnerPlan,
} from '../../calculated-fields/formula-owner-plan';
import {
  collectReportDimensions,
  collectSleeveMetrics,
  collectValueSleeveOwners,
  disambiguateSleeveCteNames,
  formulaSleeveCteName,
  formulaSleevePullAlias,
  groupCountDistinctMetrics,
  groupValueSleeveMetrics,
  identityScopingJoinKeyColumns,
  isIdentityPreJoinField,
  planFormulaSleeves,
  resolveCountDistinctGroupCteName,
  resolveValueSleeveGroupCteName,
  sanitizeSleeveNamePart,
  sleeveCteNameForColumn,
  sleeveFilterColumns,
  sleeveJoinColumns,
  splitValueSleeveGroupsByIdentity,
} from './metric-sleeve.planner';

// main = sessions (`campaign` is a main-native dimension) with ONE joined chain `hits` that
// carries BOTH pre-join shapes: `hits__hitId` rolls up as COUNT_DISTINCT per session (the
// funnel shape) while `hits__note` is a raw ANY_VALUE passthrough. The shared
// `fixtureEventsUsersOrgs` is all-identity, so it cannot exercise the split at all.
function fixtureMixedIdentityOwner(): {
  context: BlendedQueryContext;
  fieldIndex: ReadonlyMap<string, BlendedFieldEntry>;
} {
  const hitsChain = makeChain({
    relationship: makeRelationship({
      id: 'rel-hits',
      targetAlias: 'hits',
      joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
    }),
    targetTableReference: 'hits_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'hitId',
        outputAlias: 'hits__hitId',
        isHidden: false,
        aggregateFunction: 'COUNT_DISTINCT',
      },
      {
        targetFieldName: 'note',
        outputAlias: 'hits__note',
        isHidden: false,
        aggregateFunction: 'ANY_VALUE',
      },
    ],
  });
  const fieldIndex = buildBlendedFieldIndex({
    blendedFields: [
      { name: 'hits__hitId', aliasPath: 'hits', originalFieldName: 'hitId', type: 'INT64' },
      { name: 'hits__note', aliasPath: 'hits', originalFieldName: 'note', type: 'STRING' },
    ],
    availableSources: [{ aliasPath: 'hits', isIncluded: true }],
  } as never);

  const context: BlendedQueryContext = {
    ...createBuildContext('main_table')([hitsChain], ['campaign', 'hits__hitId', 'hits__note']),
    fieldIndex,
  };
  return { context, fieldIndex };
}

describe('metric-sleeve planner', () => {
  describe('sleeve metric detection', () => {
    it('collectSleeveMetrics picks COUNT_DISTINCT on blended columns only', () => {
      const outputAliasToRoot = new Map([['organizations__orgId', 'organizations']]);
      const aggs = [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' },
        { column: 'revenue', function: 'SUM' }, // main additive → not a sleeve
        { column: 'organizations__orgId', function: 'COUNT' }, // not COUNT_DISTINCT → not a sleeve
      ] as AggregationRule[];
      expect(collectSleeveMetrics(aggs, outputAliasToRoot)).toEqual([
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' },
      ]);
    });

    // C2.3: uniform routing — a joined SUM/AVG is now sleeve-eligible too, same "blended
    // column only" gate as COUNT_DISTINCT above.
    it('collectSleeveMetrics also picks joined SUM and AVG on blended columns', () => {
      const outputAliasToRoot = new Map([['organizations__orgId', 'organizations']]);
      const aggs = [
        { column: 'organizations__orgId', function: 'SUM' },
        { column: 'organizations__orgId', function: 'AVG' },
      ] as AggregationRule[];
      expect(collectSleeveMetrics(aggs, outputAliasToRoot)).toEqual(aggs);
    });

    it('collectSleeveMetrics does NOT pick a main-native (non-blended) SUM/AVG', () => {
      const outputAliasToRoot = new Map([['organizations__orgId', 'organizations']]);
      const aggs = [
        { column: 'revenue', function: 'SUM' },
        { column: 'revenue', function: 'AVG' },
      ] as AggregationRule[];
      expect(collectSleeveMetrics(aggs, outputAliasToRoot)).toEqual([]);
    });

    // MIN/MAX are routed so every metric on a joined column reads the SAME grain: off the
    // sleeve they read the pre-join roll-up's single collapsed value while SUM/AVG read the raw
    // rows, and `MIN <= AVG <= MAX` stops holding.
    it('collectSleeveMetrics picks joined MIN and MAX too', () => {
      const outputAliasToRoot = new Map([['organizations__orgId', 'organizations']]);
      const aggs = [
        { column: 'organizations__orgId', function: 'MIN' },
        { column: 'organizations__orgId', function: 'MAX' },
      ] as AggregationRule[];
      expect(collectSleeveMetrics(aggs, outputAliasToRoot)).toEqual(aggs);
    });

    it('collectSleeveMetrics still excludes COUNT and ANY_VALUE on a blended column (dedup branch)', () => {
      const outputAliasToRoot = new Map([['organizations__orgId', 'organizations']]);
      const aggs = [
        { column: 'organizations__orgId', function: 'COUNT' },
        { column: 'organizations__orgId', function: 'ANY_VALUE' },
      ] as AggregationRule[];
      expect(collectSleeveMetrics(aggs, outputAliasToRoot)).toEqual([]);
    });

    it('collectReportDimensions returns only non-aggregated columns', () => {
      const columns = ['users__country', 'organizations__orgId', 'revenue'];
      const aggs = [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' },
        { column: 'revenue', function: 'SUM' },
      ] as AggregationRule[];
      expect(collectReportDimensions(columns, aggs)).toEqual(['users__country']);
    });

    // A ROW-LEVEL calculated field is a dimension, and it reaches this function on a list
    // of its own: every calculated name was stripped out of `columns` upstream. Appended, and in
    // plan order, so the sleeve's grain lands in the same order `renderAggregatedSelect` emits its
    // own GROUP BY keys — column keys first, then the row-level ones.
    it('collectReportDimensions appends the row-level calculated names after the column ones', () => {
      const columns = ['users__country', 'organizations__orgId'];
      const aggs = [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' },
      ] as AggregationRule[];

      expect(collectReportDimensions(columns, aggs, ['session_key', 'visit_key'])).toEqual([
        'users__country',
        'session_key',
        'visit_key',
      ]);
    });
  });
  // the grouping primitive `buildBlendedQuery` uses to merge value sleeves that share an owner,
  // a column and dimensions. Tested directly (not just through buildBlendedQuery) so the
  // "different dimensions never merge" case can be exercised even though, in practice,
  // buildBlendedQuery always passes the SAME report-wide `dimensions` to every metric.
  describe('groupValueSleeveMetrics', () => {
    it('groups two functions on the SAME owner + column + dimensions into one group', () => {
      const { context } = fixtureEventsUsersOrgs();
      const sum = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;
      const avg = { column: 'organizations__orgId', function: 'AVG' } as AggregationRule;

      const groups = groupValueSleeveMetrics(
        [
          { metric: sum, dimensions: ['users__country'] },
          { metric: avg, dimensions: ['users__country'] },
        ],
        context.fieldIndex
      );

      expect(groups).toHaveLength(1);
      expect(groups[0].ownerCteName).toBe('organizations');
      expect(groups[0].dimensions).toEqual(['users__country']);
      expect(groups[0].metrics).toEqual([sum, avg]);
    });

    // One dedup pass projects every merged metric's column, and `DISTINCT` spans the whole
    // tuple — so with a declared primary key as the identity, two raw rows that are duplicates
    // by that key but differ in the OTHER column survive as two rows and inflate the first
    // column's SUM.
    it('does NOT group two metrics on DIFFERENT columns of the same owner + dimensions', () => {
      const { context } = fixtureEventsUsersOrgs();
      const sumOrgId = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;
      const sumOrgName = { column: 'organizations__name', function: 'SUM' } as AggregationRule;

      const groups = groupValueSleeveMetrics(
        [
          { metric: sumOrgId, dimensions: ['users__country'] },
          { metric: sumOrgName, dimensions: ['users__country'] },
        ],
        context.fieldIndex
      );

      expect(groups).toHaveLength(2);
      expect(groups.map(g => g.ownerCteName)).toEqual(['organizations', 'organizations']);
      expect(groups.map(g => g.metrics)).toEqual([[sumOrgId], [sumOrgName]]);
    });

    it('does NOT group two metrics with the SAME owner but DIFFERENT dimensions', () => {
      const { context } = fixtureEventsUsersOrgs();
      const sum = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;
      const avg = { column: 'organizations__orgId', function: 'AVG' } as AggregationRule;

      const groups = groupValueSleeveMetrics(
        [
          { metric: sum, dimensions: ['users__country'] },
          { metric: avg, dimensions: [] },
        ],
        context.fieldIndex
      );

      expect(groups).toHaveLength(2);
      expect(groups.map((g: { metrics: unknown }) => g.metrics)).toEqual([[sum], [avg]]);
    });

    it('does NOT group two metrics on DIFFERENT owners even with the same dimensions', () => {
      const { context } = fixtureEventsUsersOrgs();
      const sumOrg = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;
      // `users__country` isn't itself SUM-eligible under real governance, but grouping is
      // agnostic to type/function — it only needs a fieldIndex entry to resolve the owner.
      const sumUsers = { column: 'users__country', function: 'SUM' } as AggregationRule;

      const groups = groupValueSleeveMetrics(
        [
          { metric: sumOrg, dimensions: [] },
          { metric: sumUsers, dimensions: [] },
        ],
        context.fieldIndex
      );

      expect(groups).toHaveLength(2);
      expect(groups.map((g: { ownerCteName: string }) => g.ownerCteName)).toEqual([
        'organizations',
        'users',
      ]);
    });

    it('throws a clear invariant error when fieldIndex is absent', () => {
      const sum = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      expect(() => groupValueSleeveMetrics([{ metric: sum, dimensions: [] }], undefined)).toThrow(
        /groupValueSleeveMetrics: fieldIndex is required/
      );
    });

    it('throws a clear invariant error when the metric column has no fieldIndex entry', () => {
      const { context } = fixtureEventsUsersOrgs();
      const fieldIndexWithoutMetric = new Map(context.fieldIndex);
      fieldIndexWithoutMetric.delete('organizations__orgId');
      const sum = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      expect(() =>
        groupValueSleeveMetrics([{ metric: sum, dimensions: [] }], fieldIndexWithoutMetric)
      ).toThrow(
        /groupValueSleeveMetrics: no fieldIndex entry for value-sleeve metric column='organizations__orgId'/
      );
    });
  });

  // the classification the value sleeve branches on. Both wrong answers are silent —
  // an identity field read off the dedup CTE, or a pre-aggregated field read off the raw path,
  // still returns a plausible number.
  // Moved here from `MetricSleeveBuilder.buildAll`, where it was inline: this module is meant to
  // be the single answer to which sleeves exist, who owns each and what it is called, and both
  // planned follow-ups (percentile sleeves, PK-based SUM/AVG dedup) add a grouping rule.
  describe('groupCountDistinctMetrics', () => {
    const index = new Map([
      ['orders__status', { cteName: 'orders' }],
      ['orders__coupon', { cteName: 'orders' }],
      ['users__city', { cteName: 'users' }],
    ]) as never;
    const metric = (column: string) => ({ column, function: 'COUNT_DISTINCT' }) as AggregationRule;

    it('merges metrics of one owner chain and keeps distinct owners apart', () => {
      const groups = groupCountDistinctMetrics(
        [metric('orders__status'), metric('users__city'), metric('orders__coupon')],
        index
      );

      // Insertion order preserved — the WITH clause it feeds must stay deterministic.
      expect(groups.map(g => g.ownerCteName)).toEqual(['orders', 'users']);
      expect(groups[0].metrics.map(m => m.column)).toEqual(['orders__status', 'orders__coupon']);
      expect(groups[1].metrics.map(m => m.column)).toEqual(['users__city']);
    });

    // Unlike a value sleeve, this shape never reads the owner's dedup CTE, so an unresolvable
    // owner still yields correct (merely unmerged) SQL — throwing would reject a report the
    // COUNT_DISTINCT path can serve.
    it('falls back to the column name when the field index cannot resolve the owner', () => {
      const groups = groupCountDistinctMetrics([metric('mystery')], new Map() as never);

      expect(groups).toEqual([{ ownerCteName: 'mystery', metrics: [metric('mystery')] }]);
    });

    it('names a singleton after its column and a merged group after its owner', () => {
      const [merged] = groupCountDistinctMetrics(
        [metric('orders__status'), metric('orders__coupon')],
        index
      );
      const [single] = groupCountDistinctMetrics([metric('users__city')], index);

      // The singleton keeps the bare name its own SQL tests pin, so merging changed no bytes
      // for the common one-metric case.
      expect(resolveCountDistinctGroupCteName(single)).toBe('sleeve_users__city');
      expect(resolveCountDistinctGroupCteName(merged)).toBe('sleeve_orders_counts');
    });
  });

  describe('isIdentityPreJoinField', () => {
    it('tells a raw ANY_VALUE passthrough apart from a real pre-join aggregate on the SAME chain', () => {
      const { context, fieldIndex } = fixtureMixedIdentityOwner();

      expect(isIdentityPreJoinField('hits__note', fieldIndex, context)).toBe(true);
      expect(isIdentityPreJoinField('hits__hitId', fieldIndex, context)).toBe(false);
    });

    it('defaults to identity when no declared field resolves', () => {
      const { context } = fixtureEventsUsersOrgs();
      const fieldIndex = context.fieldIndex!;

      // Indexed as a blended column, but absent from its chain's `blendedFields`.
      expect(isIdentityPreJoinField('organizations__name', fieldIndex, context)).toBe(true);
      expect(isIdentityPreJoinField('not_a_column_at_all', fieldIndex, context)).toBe(true);
    });
  });

  describe('identityScopingJoinKeyColumns', () => {
    it('drops a join key the declared key already carries', () => {
      expect(identityScopingJoinKeyColumns(['user_id'], ['user_id'])).toEqual([]);
    });

    it('keeps a join key the declared key does NOT carry, which is what scopes it', () => {
      expect(identityScopingJoinKeyColumns(['line_no'], ['order_id'])).toEqual(['order_id']);
    });

    it('drops only the overlapping column of a composite join key, keeping the order of the rest', () => {
      expect(
        identityScopingJoinKeyColumns(['tenant_id', 'line_no'], ['tenant_id', 'order_id'])
      ).toEqual(['order_id']);
    });

    // Snowflake quotes every identifier, so `USER_ID` and `user_id` are two different columns
    // there. Folding them would drop a slot that scopes the key by a column the key does not
    // carry — a silent narrowing of the identity, which is the one direction that changes a number.
    it('does NOT fold case: a case-only difference is a different column', () => {
      expect(identityScopingJoinKeyColumns(['user_id'], ['USER_ID'])).toEqual(['USER_ID']);
    });

    it('is a no-op for a source with no declared key at all', () => {
      expect(identityScopingJoinKeyColumns([], ['order_id'])).toEqual(['order_id']);
    });
  });

  // A guard the column-keyed grouping already satisfies (identity is a property of the column),
  // exercised directly on a hand-built mixed group. A missed split is silent —
  // `buildValueSleeveGroupCte` would read the non-identity value off the identity metric's
  // per-raw-row dedup set, multiplying it once per raw row of that fan-out.
  describe('splitValueSleeveGroupsByIdentity', () => {
    const sumHits = { column: 'hits__hitId', function: 'SUM' } as AggregationRule;
    const avgHits = { column: 'hits__hitId', function: 'AVG' } as AggregationRule;
    const sumNote = { column: 'hits__note', function: 'SUM' } as AggregationRule;

    it('splits a mixed group into an identity and a non-identity sub-group, each keeping owner + dimensions', () => {
      const { context } = fixtureMixedIdentityOwner();
      const mixed: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: ['campaign'],
        metrics: [sumHits, sumNote],
      };

      expect(splitValueSleeveGroupsByIdentity([mixed], context)).toEqual([
        { ownerCteName: 'hits', dimensions: ['campaign'], metrics: [sumNote] },
        { ownerCteName: 'hits', dimensions: ['campaign'], metrics: [sumHits] },
      ]);
    });

    it('returns homogeneous groups unchanged — same groups, same order, same metric order', () => {
      const { context } = fixtureMixedIdentityOwner();
      const identityOnly: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: ['campaign'],
        metrics: [sumNote],
      };
      const nonIdentityOnly: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: [],
        metrics: [sumHits, avgHits],
      };

      expect(splitValueSleeveGroupsByIdentity([identityOnly, nonIdentityOnly], context)).toEqual([
        identityOnly,
        nonIdentityOnly,
      ]);
    });

    it('splits only the mixed group, leaving the others in place', () => {
      const { context } = fixtureMixedIdentityOwner();
      const mixed: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: ['campaign'],
        metrics: [sumNote, sumHits],
      };
      const untouched: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: [],
        metrics: [avgHits],
      };

      expect(splitValueSleeveGroupsByIdentity([mixed, untouched], context)).toEqual([
        { ownerCteName: 'hits', dimensions: ['campaign'], metrics: [sumNote] },
        { ownerCteName: 'hits', dimensions: ['campaign'], metrics: [sumHits] },
        untouched,
      ]);
    });

    it('passes groups through untouched when the context carries no fieldIndex', () => {
      const { context } = fixtureMixedIdentityOwner();
      const mixed: ValueSleeveGroup = {
        ownerCteName: 'hits',
        dimensions: ['campaign'],
        metrics: [sumHits, sumNote],
      };

      expect(
        splitValueSleeveGroupsByIdentity([mixed], { ...context, fieldIndex: undefined })
      ).toEqual([mixed]);
    });
  });

  // 1 FIX 1 / review H6. Both failure modes are silent-to-fatal at the warehouse: a
  // duplicate name in one WITH clause, or — where the dialect tolerates redefinition — a sleeve
  // shadowing a real chain CTE and being read in its place.
  describe('disambiguateSleeveCteNames', () => {
    it('keeps the first occurrence bare and gives every later duplicate the smallest free _<n>', () => {
      // The documented way two sleeves want one name: a crafted `postJoinAggregations` override
      // puts COUNT_DISTINCT and SUM on the SAME joined column, and those two sleeves never merge.
      const base = sleeveCteNameForColumn('organizations__orgId');

      expect(disambiguateSleeveCteNames([base, base, base], [])).toEqual([
        base,
        `${base}_2`,
        `${base}_3`,
      ]);
    });

    it('skips a suffix an earlier name already took', () => {
      expect(
        disambiguateSleeveCteNames(['sleeve_x', 'sleeve_x', 'sleeve_x_2', 'sleeve_x'], [])
      ).toEqual(['sleeve_x', 'sleeve_x_2', 'sleeve_x_2_2', 'sleeve_x_3']);
    });

    it('seeds main, the kept-groups CTE and every chain CTE plus its _raw/_joined variants', () => {
      const { context } = fixtureEventsUsersOrgs();

      expect(
        disambiguateSleeveCteNames(
          [
            'main',
            KEPT_GROUPS_CTE,
            'organizations',
            'organizations_raw',
            'organizations_joined',
            'users',
            'users_raw',
            'users_joined',
            'sleeve_users__country',
          ],
          context.chains
        )
      ).toEqual([
        'main_2',
        `${KEPT_GROUPS_CTE}_2`,
        'organizations_2',
        'organizations_raw_2',
        'organizations_joined_2',
        'users_2',
        'users_raw_2',
        'users_joined_2',
        'sleeve_users__country',
      ]);
    });

    it('returns an empty list for no sleeves', () => {
      expect(disambiguateSleeveCteNames([], [])).toEqual([]);
    });
  });

  // Redshift TRUNCATES an over-long identifier instead of rejecting it, and the disambiguating
  // suffix sits at the END — so two long names differing only past the cut came back as ONE, and
  // the very suffix meant to tell them apart was the part thrown away.
  describe('disambiguateSleeveCteNames — identifier byte limit', () => {
    const longBase = (tail: string) => `sleeve_${'x'.repeat(130)}${tail}`;

    it('cuts a name to the byte limit and still keeps duplicates distinct', () => {
      const [first, second] = disambiguateSleeveCteNames(
        [longBase('_alpha'), longBase('_alpha')],
        []
      );

      expect(Buffer.byteLength(first, 'utf8')).toBeLessThanOrEqual(127);
      expect(Buffer.byteLength(second, 'utf8')).toBeLessThanOrEqual(127);
      expect(first).not.toBe(second);
      // The suffix survives the cut — it is appended to an already-shortened base.
      expect(second.endsWith('_2')).toBe(true);
    });

    it('keeps two names apart when they differ only PAST the cut', () => {
      const names = disambiguateSleeveCteNames([longBase('_alpha'), longBase('_beta')], []);

      // Both truncate to the same 127 bytes, so the second must be disambiguated rather than
      // silently becoming the first.
      expect(names[0]).not.toBe(names[1]);
      expect(new Set(names).size).toBe(2);
    });

    it('leaves a short name untouched', () => {
      expect(disambiguateSleeveCteNames(['sleeve_amount'], [])).toEqual(['sleeve_amount']);
    });
  });

  describe('sleeve CTE naming', () => {
    it('sanitizeSleeveNamePart folds every non-word char into _ so a nested path stays one identifier', () => {
      expect(sanitizeSleeveNamePart('users.address.city')).toBe('users_address_city');
      expect(sanitizeSleeveNamePart('orders__amount (net)')).toBe('orders__amount__net_');
    });

    it('sleeveCteNameForColumn prefixes the sanitized column', () => {
      expect(sleeveCteNameForColumn('organizations__orgId')).toBe('sleeve_organizations__orgId');
      expect(sleeveCteNameForColumn('users.address.city')).toBe('sleeve_users_address_city');
    });

    it('resolveValueSleeveGroupCteName keeps the bare per-column name for a group of functions', () => {
      const group: ValueSleeveGroup = {
        ownerCteName: 'organizations',
        dimensions: ['users__country'],
        metrics: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__orgId', function: 'AVG' } as AggregationRule,
        ],
      };

      expect(resolveValueSleeveGroupCteName(group)).toBe('sleeve_organizations__orgId');
    });

    // Naming a two-column group after one of its columns would be a silent lie in the emitted
    // SQL; the grouping key makes it unreachable, so say so rather than pick a winner.
    it('resolveValueSleeveGroupCteName refuses a group spanning more than one column', () => {
      const multiColumn: ValueSleeveGroup = {
        ownerCteName: 'organizations',
        dimensions: ['users__country'],
        metrics: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__name', function: 'SUM' } as AggregationRule,
        ],
      };

      expect(() => resolveValueSleeveGroupCteName(multiColumn)).toThrow(
        /carries column\(s\) \[organizations__orgId, organizations__name\]/
      );
    });
  });

  // these decide which dedup CTEs a sleeve subquery joins. Including a HAVING rule's
  // column would join a CTE for a filter the sleeve never applies; dropping the kept-groups
  // dimensions emits a Totals sleeve whose join line references a CTE absent from its own FROM.
  describe('sleeve join columns', () => {
    const filterOpts = (overrides: Partial<SleeveFilterOptions> = {}): SleeveFilterOptions => ({
      filters: [
        { column: 'users__country', operator: 'eq', value: 'US', placement: 'post-join' },
        {
          column: 'organizations__orgId',
          function: 'COUNT_DISTINCT',
          operator: 'gt',
          value: 5,
          placement: 'post-join',
        },
      ] as FilterRule[],
      whereParamPrefix: 'p',
      ...overrides,
    });

    it('sleeveFilterColumns keeps WHERE rule columns and drops HAVING (function-carrying) rules', () => {
      expect(sleeveFilterColumns(filterOpts())).toEqual(['users__country']);
    });

    it('sleeveJoinColumns appends the kept-groups dimensions to the filter columns', () => {
      expect(
        sleeveJoinColumns(
          filterOpts({
            keptGroups: { join: `JOIN ${KEPT_GROUPS_CTE} ON 1 = 1`, dimensions: ['campaign'] },
          })
        )
      ).toEqual(['users__country', 'campaign']);
    });

    it('sleeveJoinColumns is just the filter columns without a restriction', () => {
      expect(sleeveJoinColumns(filterOpts())).toEqual(['users__country']);
    });

    // The HAVING rule of an aggregate-level Calculated Field carries no `function`,
    // so a `function` test would pull its column into the sleeve's join list — a dedup CTE joined
    // for a predicate no sleeve template ever emits.
    it('sleeveFilterColumns drops a function-less rule routed to HAVING', () => {
      const filters: RoutedFilterRule[] = [
        { column: 'users__country', operator: 'eq', value: 'US', clause: 'where' },
        { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
      ];
      expect(sleeveFilterColumns(filterOpts({ filters }))).toEqual(['users__country']);
    });
  });

  // A formula's JOINED aggregate call gets a sleeve of its own — keyed by the CALL, not by
  // a column, which is what lets v1 skip merging entirely (and with it the multi-column hazard
  // `groupValueSleeveMetrics` guards against).
  describe('formula sleeves', () => {
    /**
     * A metric whose formula is `FN(args) + FN(args) + …`, with each hand-built call carrying its
     * REAL span into that formula — the argument-count guard reads the formula text through those
     * spans, so a synthetic span would make every such assertion vacuous.
     */
    const metric = (
      outputName: string,
      ...specs: ReadonlyArray<{ fn: string; args: string; path?: string }>
    ): { outputName: string; formula: string; ownerPlan: FormulaOwnerPlan } => {
      const parts: string[] = [];
      const calls: FormulaAggregateCall[] = [];
      let cursor = 0;
      for (const spec of specs) {
        if (parts.length > 0) cursor += ' + '.length;
        const text = `${spec.fn}(${spec.args})`;
        calls.push({
          fn: spec.fn,
          start: cursor,
          end: cursor + text.length,
          // Real argument boundaries too — the quantifier scan reads the formula text through them.
          argStart: cursor + spec.fn.length + 1,
          argEnd: cursor + text.length - 1,
          owner:
            spec.path === undefined ? { kind: 'own' } : { kind: 'joined', aliasPath: spec.path },
          refs: [],
        });
        cursor += text.length;
        parts.push(text);
      }
      return {
        outputName,
        formula: parts.join(' + '),
        ownerPlan: { calls, hasJoinedCall: calls.some(c => c.owner.kind === 'joined') },
      };
    };
    const joined = (fn: string, path: string) => ({ fn, args: 'x', path });
    const own = (fn: string) => ({ fn, args: 'x' });

    describe('planFormulaSleeves', () => {
      it('plans one sleeve per JOINED call and none for an own-Data-Mart call', () => {
        const plans = planFormulaSleeves([metric('roi', own('SUM'), joined('SUM', 'orders'))]);

        expect(plans).toHaveLength(1);
        expect(plans[0]).toMatchObject({
          metricOutputName: 'roi',
          // The index into the metric's OWN call list, own-owner calls included — so the name
          // identifies the call in the formula rather than its rank among joined ones.
          callIndex: 1,
          aliasPath: 'orders',
          ownerCteName: 'orders',
          baseCteName: 'sleeve_fx_roi_1',
          pullAlias: '_fx_roi_1',
        });
        expect(plans[0].call.fn).toBe('SUM');
      });

      it('gives two joined calls of the SAME metric distinct names', () => {
        const plans = planFormulaSleeves([
          metric('roi', joined('SUM', 'orders'), joined('AVG', 'orders')),
        ]);

        expect(plans.map(p => p.baseCteName)).toEqual(['sleeve_fx_roi_0', 'sleeve_fx_roi_1']);
        expect(plans.map(p => p.pullAlias)).toEqual(['_fx_roi_0', '_fx_roi_1']);
      });

      it('keeps metric order and, within a metric, formula order', () => {
        const plans = planFormulaSleeves([
          metric('roi', joined('SUM', 'orders')),
          metric('aov', joined('SUM', 'orders'), joined('AVG', 'orders')),
        ]);

        expect(plans.map(p => p.baseCteName)).toEqual([
          'sleeve_fx_roi_0',
          'sleeve_fx_aov_0',
          'sleeve_fx_aov_1',
        ]);
      });

      // A joined COUNT counts ROWS: a sleeve would count the owner's deduped raw rows, while the
      // report metric on the same column counts the main rows that survived the join — 5 versus 1
      // for one main row with five order lines. The product rule is "computed after dedup", which
      // is what the report path does, so this call renders in the outer SELECT with no sleeve.
      it('gives a joined COUNT no sleeve, and keeps the call index of the ones it does', () => {
        const plans = planFormulaSleeves([
          metric('mixed', joined('COUNT', 'orders'), joined('SUM', 'orders')),
        ]);

        expect(plans.map(p => p.baseCteName)).toEqual(['sleeve_fx_mixed_1']);
      });

      it('keeps the sleeve for COUNT(DISTINCT …), which asks a different question', () => {
        const plans = planFormulaSleeves([
          metric('buyers', { fn: 'COUNT', args: 'DISTINCT id', path: 'orders' }),
        ]);

        expect(plans.map(p => p.baseCteName)).toEqual(['sleeve_fx_buyers_0']);
      });

      it('resolves a NESTED alias path to its chain CTE name', () => {
        const [plan] = planFormulaSleeves([metric('roi', joined('SUM', 'users.address'))]);

        expect(plan.aliasPath).toBe('users.address');
        expect(plan.ownerCteName).toBe('users_address');
      });

      it('sanitizes the metric name into a single legal identifier', () => {
        const [plan] = planFormulaSleeves([metric('Net ROI (%)', joined('SUM', 'orders'))]);

        expect(plan.baseCteName).toBe('sleeve_fx_Net_ROI_____0');
        expect(plan.pullAlias).toBe('_fx_Net_ROI_____0');
      });

      // `aliasPathToCteName` throws a bare Error for this, whose 500 carries no body at all — the
      // user is told nothing and cannot act. A stored path CAN be malformed: cascadeAliasRename
      // rewrites it, and nothing re-validates a formula saved before this feature existed.
      it('refuses a path that is not a legal alias path, naming the metric', () => {
        expect(() => planFormulaSleeves([metric('roi', joined('SUM', 'Orders'))])).toThrow(
          /Calculated field 'roi' aggregates SUM\(\.\.\.\) over the joined source 'Orders'/
        );
      });

      it('plans nothing for a metric with no joined call at all', () => {
        expect(planFormulaSleeves([metric('ctr', own('SUM'))])).toEqual([]);
      });

      // The shapes this module consumes are produced by `buildFormulaOwnerPlan`, not by the
      // hand-built calls above — one test drives the real analyzer so the two cannot drift.
      it('routes a real parsed formula: the joined half gets a sleeve, the own half does not', () => {
        const stored =
          `SUM({{ref field="cost"}}) * 2 * SUM({{ref path="orders" field="amount"}})` as const;
        const { plan } = buildFormulaOwnerPlan(stored, n =>
          ['SUM', 'AVG', 'COUNT'].includes(n.toUpperCase())
        );

        const plans = planFormulaSleeves([{ outputName: 'roi', formula: stored, ownerPlan: plan }]);

        expect(plans).toHaveLength(1);
        expect(plans[0].ownerCteName).toBe('orders');
        expect(plans[0].baseCteName).toBe('sleeve_fx_roi_1');
        // The span the renderer swaps for this sleeve's pull must be the WHOLE joined call.
        expect(stored.slice(plans[0].call.start, plans[0].call.end)).toBe(
          `SUM({{ref path="orders" field="amount"}})`
        );
        expect(plans[0].call.refs.map(r => r.field)).toEqual(['amount']);
      });
    });

    // `FormulaSleeveGroup.valueSql` is singular, so every argument past the first is DROPPED. Not
    // always loudly: Snowflake and Redshift accept a one-argument LISTAGG with an empty default
    // delimiter and return a silently wrong string.
    describe('planFormulaSleeves — multi-argument joined calls', () => {
      it('refuses the SILENT shape: LISTAGG with a separator', () => {
        expect(() =>
          planFormulaSleeves([metric('skus', { fn: 'LISTAGG', args: `sku, '|'`, path: 'orders' })])
        ).toThrow(
          /Calculated field 'skus': LISTAGG\(\.\.\.\) reads the joined source 'orders' and was given more than one argument/
        );
      });

      it('refuses a loud shape too: APPROX_QUANTILES with a bucket count', () => {
        expect(() =>
          planFormulaSleeves([
            metric('p50', { fn: 'APPROX_QUANTILES', args: 'amount, 100', path: 'orders' }),
          ])
        ).toThrow(/An aggregate over a joined Data Mart currently takes exactly one argument/);
      });

      it('refuses MAX_BY, whose second argument is a whole second column', () => {
        expect(() =>
          planFormulaSleeves([metric('top', { fn: 'MAX_BY', args: 'sku, amount', path: 'orders' })])
        ).toThrow(/'top'/);
      });

      // A comma inside a string literal or a nested call is not an argument separator — refusing
      // those would reject formulas the single-slot sleeve computes perfectly well.
      it('accepts a single argument that CONTAINS commas in a literal or a nested call', () => {
        const plans = planFormulaSleeves([
          metric('clean', { fn: 'SUM', args: `GREATEST(a, b) + LENGTH('x,y')`, path: 'orders' }),
        ]);

        expect(plans).toHaveLength(1);
        expect(plans[0].baseCteName).toBe('sleeve_fx_clean_0');
      });

      // Only a JOINED call is restricted: an own-Data-Mart call renders in place in the outer
      // SELECT with its arguments intact, so nothing about it is dropped.
      it('leaves a multi-argument OWN-Data-Mart call alone', () => {
        expect(planFormulaSleeves([metric('skus', { fn: 'LISTAGG', args: `sku, '|'` })])).toEqual(
          []
        );
      });

      // The count is per CALL SPAN: an own call's commas elsewhere in the same formula must not
      // be attributed to the joined one, which would refuse a formula the sleeve computes fine.
      it('does not attribute the commas of another call to the joined one', () => {
        const plans = planFormulaSleeves([
          metric(
            'mixed',
            { fn: 'LISTAGG', args: `sku, '|'` },
            { fn: 'SUM', args: 'amount', path: 'orders' }
          ),
        ]);

        expect(plans.map(p => p.baseCteName)).toEqual(['sleeve_fx_mixed_1']);
      });

      it('refuses the joined call while an own multi-argument call in the SAME formula is fine', () => {
        expect(() =>
          planFormulaSleeves([
            metric(
              'mixed',
              { fn: 'LISTAGG', args: `sku, '|'` },
              { fn: 'LISTAGG', args: `sku, '|'`, path: 'orders' }
            ),
          ])
        ).toThrow(/reads the joined source 'orders'/);
      });
    });

    // A set quantifier is a keyword of the CALL. Left in the sleeve's inner slot it emits
    // `DISTINCT <expr> AS _val`, which no warehouse parses — and `COUNT(DISTINCT <joined field>)`
    // is the most natural thing an analyst types, so it would fail at report time.
    describe('planFormulaSleeves — set quantifiers', () => {
      it('lifts COUNT’s DISTINCT off the argument', () => {
        const plans = planFormulaSleeves([
          metric('buyers', { fn: 'COUNT', args: 'DISTINCT id', path: 'orders' }),
        ]);

        expect(plans[0].distinct).toBe(true);
        // Past the quantifier: what the slot renders is the VALUE, not the keyword.
        expect(plans[0].valueStart).toBe('COUNT(DISTINCT'.length);
      });

      // Every other aggregate would have to carry it into the slot, so it is refused here rather
      // than met as a syntax error on a report run.
      it.each(['SUM', 'AVG', 'STRING_AGG', 'ARRAY_AGG'])('refuses %s(DISTINCT …)', fn => {
        expect(() =>
          planFormulaSleeves([metric('total', { fn, args: 'DISTINCT amount', path: 'orders' })])
        ).toThrow(/Only COUNT\(DISTINCT \.\.\.\) can be de-duplicated over a joined Data Mart/);
      });

      // `ALL` is the default and means nothing here, but it is the same syntax error in the slot.
      it('skips a leading ALL without treating it as DISTINCT', () => {
        const plans = planFormulaSleeves([
          metric('total', { fn: 'SUM', args: 'ALL amount', path: 'orders' }),
        ]);

        expect(plans[0].distinct).toBe(false);
        expect(plans[0].valueStart).toBe('SUM(ALL'.length);
      });

      it.each([
        ['a string literal', `'DISTINCT' || sku`],
        ['a comment', `/* DISTINCT */ amount`],
      ])('does not read a DISTINCT written inside %s as a quantifier', (_case, args) => {
        const plans = planFormulaSleeves([metric('x', { fn: 'SUM', args, path: 'orders' })]);

        expect(plans[0].distinct).toBe(false);
        expect(plans[0].valueStart).toBe('SUM('.length);
      });

      it('leaves an own-Data-Mart DISTINCT call alone — it renders in place', () => {
        expect(planFormulaSleeves([metric('buyers', { fn: 'SUM', args: 'DISTINCT id' })])).toEqual(
          []
        );
      });
    });

    describe('formula sleeve naming', () => {
      // A formula sleeve shares ONE WITH clause with the column-keyed families, and its name is
      // derived from a metric name rather than a column — so a joined column named `fx_<metric>_<i>`
      // lands on exactly the same string. Emitting both would be a duplicate CTE name the
      // warehouse rejects, or worse, one sleeve silently shadowing the other.
      it('a formula sleeve colliding with a VALUE sleeve name is disambiguated, not emitted twice', () => {
        const valueName = sleeveCteNameForColumn('fx_roi_0');
        const [{ baseCteName: formulaName }] = planFormulaSleeves([
          metric('roi', joined('SUM', 'orders')),
        ]);
        expect(formulaName).toBe(valueName);

        // Formula sleeves are planned LAST, after every column-keyed sleeve, so the existing
        // family keeps its bare name and the newcomer is the one renamed.
        expect(disambiguateSleeveCteNames([valueName, formulaName], [])).toEqual([
          'sleeve_fx_roi_0',
          'sleeve_fx_roi_0_2',
        ]);
      });

      it('a formula sleeve colliding with a real chain CTE is disambiguated too', () => {
        const { context } = fixtureEventsUsersOrgs();
        const chains = [
          ...context.chains,
          makeChain({
            relationship: makeRelationship({ id: 'rel-fx', targetAlias: 'sleeve_fx_roi_0' }),
            targetTableReference: 'fx_table',
            parentAlias: 'main',
            blendedFields: [],
          }),
        ];

        expect(disambiguateSleeveCteNames([formulaSleeveCteName('roi', 0)], chains)).toEqual([
          'sleeve_fx_roi_0_2',
        ]);
      });

      // Redshift TRUNCATES rather than rejects, and the call index — the ONLY thing telling two
      // calls of one metric apart — sits at the very END of the name.
      it('keeps the call index inside the byte limit for a very long metric name', () => {
        const long = 'm'.repeat(200);

        const names = [formulaSleeveCteName(long, 0), formulaSleeveCteName(long, 1)];

        expect(Buffer.byteLength(names[0], 'utf8')).toBeLessThanOrEqual(127);
        expect(Buffer.byteLength(names[1], 'utf8')).toBeLessThanOrEqual(127);
        expect(names[0].endsWith('_0')).toBe(true);
        expect(names[1].endsWith('_1')).toBe(true);
        // Distinct BEFORE the disambiguator runs, so the emitted name still says which call it is
        // instead of carrying an invented `_2`.
        expect(names[0]).not.toBe(names[1]);
        expect(disambiguateSleeveCteNames(names, [])).toEqual(names);
      });

      it('keeps a long pull alias inside the byte limit with its call index intact', () => {
        const alias = formulaSleevePullAlias('m'.repeat(200), 7);

        expect(Buffer.byteLength(alias, 'utf8')).toBeLessThanOrEqual(127);
        expect(alias.startsWith('_fx_')).toBe(true);
        expect(alias.endsWith('_7')).toBe(true);
      });

      it('leaves a short name untouched by the byte budget', () => {
        expect(formulaSleeveCteName('roi', 0)).toBe('sleeve_fx_roi_0');
        expect(formulaSleevePullAlias('roi', 0)).toBe('_fx_roi_0');
      });
    });

    // A formula sleeve is ALWAYS the identity (raw) branch, so its owner's `<alias>_raw` CTE must
    // carry `__owox_rid` — and no AggregationRule mentions that owner, so the aggregations pass
    // cannot see it. The builder is handed already-rendered SQL and cannot detect the omission:
    // the sleeve would reference a surrogate its own FROM never projected.
    describe('collectValueSleeveOwners with formula sleeves', () => {
      const formulaPlansFor = (aliasPath: string) =>
        planFormulaSleeves([metric('roi', joined('SUM', aliasPath))]);

      it('adds a formula sleeve owner that NO aggregation rule mentions', () => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

        expect(
          collectValueSleeveOwners([], outputAliasToRoot, context, formulaPlansFor('organizations'))
        ).toEqual(new Map([['organizations', { kind: 'row-surrogate' }]]));
      });

      it('unchanged when no formula sleeves are passed', () => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

        expect(collectValueSleeveOwners([], outputAliasToRoot, context)).toEqual(new Map());
      });

      // A formula owner is named by its CHAIN, not by a metric column, so it is resolvable with no
      // field index at all — and skipping it would emit a sleeve reading a surrogate its own
      // `<alias>_raw` never projected, which fails only at the warehouse.
      it('collects a formula owner even with no field index', () => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

        expect(
          collectValueSleeveOwners(
            [],
            outputAliasToRoot,
            { ...context, fieldIndex: undefined },
            formulaPlansFor('organizations')
          )
        ).toEqual(new Map([['organizations', { kind: 'row-surrogate' }]]));
      });

      // The owner's DECLARED key rides the same projection path as the surrogate, so a formula
      // owner with one must resolve to it — `buildFormulaSleeveCte` dedups on those columns.
      it('resolves the declared primary key of the owner, not just the surrogate', () => {
        const ordersChain = makeChain({
          relationship: makeRelationship({
            id: 'rel-orders',
            targetAlias: 'orders',
            joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
          }),
          targetTableReference: 'orders_table',
          parentAlias: 'main',
          blendedFields: [],
          targetPrimaryKeyFields: ['order_id', 'line_no'],
        });
        const context: BlendedQueryContext = {
          ...createBuildContext('main_table')([ordersChain], ['campaign']),
          fieldIndex: new Map(),
        };

        expect(collectValueSleeveOwners([], new Map(), context, formulaPlansFor('orders'))).toEqual(
          new Map([['orders', { kind: 'primary-key', columns: ['order_id', 'line_no'] }]])
        );
      });

      // Same contract the aggregations pass keeps: the sleeve builder reports the mismatch, and
      // its message names the calculation, which this one could not.
      it('skips a formula owner with no chain under that name', () => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

        expect(
          collectValueSleeveOwners([], outputAliasToRoot, context, formulaPlansFor('ghost'))
        ).toEqual(new Map());
      });

      it('merges a formula owner with the value-sleeve owners of the same report', () => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
        const aggs = [{ column: 'users__country', function: 'SUM' }] as AggregationRule[];

        expect(
          collectValueSleeveOwners(
            aggs,
            outputAliasToRoot,
            context,
            formulaPlansFor('organizations')
          )
        ).toEqual(
          new Map([
            ['organizations', { kind: 'row-surrogate' }],
            ['users', { kind: 'row-surrogate' }],
          ])
        );
      });
    });
  });
});
