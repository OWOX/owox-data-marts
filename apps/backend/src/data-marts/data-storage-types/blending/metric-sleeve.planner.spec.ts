import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
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
import {
  collectReportDimensions,
  collectSleeveMetrics,
  disambiguateSleeveCteNames,
  groupCountDistinctMetrics,
  groupValueSleeveMetrics,
  isIdentityPreJoinField,
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
  });
});
