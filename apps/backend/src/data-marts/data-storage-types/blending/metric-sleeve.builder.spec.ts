import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
import {
  TestBlendedQueryBuilder,
  TestBlendedWithRenderer,
  fixtureEventsUsersOrgs,
  makeChain,
  makeRelationship,
} from '../interfaces/__fixtures__/blended-query-builder-fixtures';
import { BlendedQueryContext } from '../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../services/blended-field-index';
import {
  createBuildContext,
  normalizeSql,
} from '../interfaces/__fixtures__/blended-query-builder-fixtures';

const buildContext = createBuildContext('main_table');

describe('MetricSleeveBuilder', () => {
  it('joins main + needed _raw and counts distinct at the dim grain', () => {
    const builder = new TestBlendedQueryBuilder();
    const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;

    const sleeve = builder
      .sleeves()
      .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);

    expect(sleeve.cteName).toBe('sleeve_organizations__orgId');
    expect(sleeve.alias).toBe('organizations__orgId | COUNTUNIQUE');
    // TestBlendedQueryBuilder only backtick-quotes identifiers that need it (e.g. the
    // ` | ` in the aggregated alias) — plain identifiers below are legal unquoted.
    expect(normalizeSql(sleeve.sql)).toContain(
      'COUNT(DISTINCT organizations_raw.orgId) AS `organizations__orgId | COUNTUNIQUE`'
    );
    expect(normalizeSql(sleeve.sql)).toContain('FROM main');
    // the metric owner (organizations) is joined via its RAW ancestor closure
    // (fan-out identity source), but the BLENDED dimension (users__country) resolves through
    // the DEDUP CTE `users` — the SAME `qualify` ref the outer GROUP BY uses — so the sleeve
    // no longer joins `users_raw` for the dimension.
    expect(normalizeSql(sleeve.sql)).toContain(
      'LEFT JOIN organizations_raw ON main.org_id = organizations_raw.orgId'
    );
    expect(normalizeSql(sleeve.sql)).toContain('LEFT JOIN users ON main.user_id = users.userId');
    expect(normalizeSql(sleeve.sql)).not.toContain('users_raw');
    expect(normalizeSql(sleeve.sql)).toContain('GROUP BY users.users__country');
    expect(sleeve.dimRefs).toEqual([
      // outer: the final aggregation CTE's own root-alias.column ref.
      // sleeve: the sleeve CTE's OWN projected column — the join this feeds runs outside this
      // CTE, where only its SELECTed columns are visible. The sleeve now PROJECTS `outer` too
      // (byte-identical by construction), so a fanning dimension's roll-up matches.
      {
        column: 'users__country',
        outer: 'users.users__country',
        sleeve: 'sleeve_organizations__orgId._owox_dim_0',
      },
    ]);
  });

  // Two dimensions differing only in case used to become ONE column inside the sleeve: only
  // Snowflake overrides `quoteIdentifier`, so every other dialect emits a safe identifier
  // unquoted and the engine folds or case-insensitively resolves it. The CTE then held two
  // identically-named columns and the join back on them was ambiguous. Projecting positionally
  // removes the collision by construction rather than guarding against it.
  it('projects dimensions under positional private aliases, so a case-only pair cannot collide', () => {
    const builder = new TestBlendedQueryBuilder();
    const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;

    const sleeve = builder
      .sleeves()
      .buildSleeveCte(metric, ['users__country', 'USERS__COUNTRY'], context, outputAliasToRoot);
    const sql = normalizeSql(sleeve.sql);

    expect(sql).toContain('AS _owox_dim_0');
    expect(sql).toContain('AS _owox_dim_1');
    // Neither dimension's own name is used as an output alias, in either spelling.
    expect(sql).not.toMatch(/AS users__country/i);
    expect(sleeve.dimRefs.map(d => d.sleeve)).toEqual([
      'sleeve_organizations__orgId._owox_dim_0',
      'sleeve_organizations__orgId._owox_dim_1',
    ]);
  });

  // two COUNT DISTINCT metrics on the same owner chain resolve to identical
  // joins, WHERE and GROUP BY, so they share ONE CTE with one aggregate each. Emitting a CTE
  // per metric made a Totals report over N joined text columns re-scan the sources N times.
  it('merges COUNT_DISTINCT metrics of one owner chain into a single CTE', () => {
    const builder = new TestBlendedWithRenderer();
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
      }),
      targetTableReference: 'orders_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'status',
          outputAlias: 'orders__status',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        {
          targetFieldName: 'coupon',
          outputAlias: 'orders__coupon',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'orders__status',
          aliasPath: 'orders',
          originalFieldName: 'status',
          type: 'STRING',
        },
        {
          name: 'orders__coupon',
          aliasPath: 'orders',
          originalFieldName: 'coupon',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['country', 'orders__status', 'orders__coupon']),
      fieldIndex,
      aggregations: [
        { column: 'orders__status', function: 'COUNT_DISTINCT' } as AggregationRule,
        { column: 'orders__coupon', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    });
    const s = normalizeSql(sql);

    // One CTE, named after the owner chain, carrying BOTH counts...
    expect(s).toContain('sleeve_orders_counts AS (');
    expect(s).toContain('COUNT(DISTINCT orders_raw.status) AS `orders__status | COUNTUNIQUE`');
    expect(s).toContain('COUNT(DISTINCT orders_raw.coupon) AS `orders__coupon | COUNTUNIQUE`');
    // ...instead of one CTE per metric, and a single join-back feeds both pulls.
    expect(s).not.toContain('sleeve_orders__status AS (');
    expect(s).not.toContain('sleeve_orders__coupon AS (');
    expect(s.match(/LEFT JOIN sleeve_orders_counts ON/g)).toHaveLength(1);
  });

  // (tester): every non-identity value-sleeve test so far used a ROOT owner, while
  // the changeset puts multi-hop bridges in its headline. A NESTED owner must join its own dedup
  // CTE to its PARENT raw CTE (not to `main`) and still read the already-aggregated column.
  it('reads a NESTED non-identity owner through its parent raw CTE', () => {
    const builder = new TestBlendedQueryBuilder();
    const sessionsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-sessions',
        targetAlias: 'sessions',
        joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
      }),
      targetTableReference: 'sessions_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'campaign',
          outputAlias: 'sessions__campaign',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const hitsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-hits',
        targetAlias: 'hits',
        joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
      }),
      targetTableReference: 'hits_table',
      parentAlias: 'sessions',
      blendedFields: [
        {
          targetFieldName: 'hit_id',
          outputAlias: 'hits__hit_id',
          isHidden: false,
          // NON-identity: already aggregated per session before the join.
          aggregateFunction: 'COUNT_DISTINCT',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'sessions__campaign',
          aliasPath: 'sessions',
          originalFieldName: 'campaign',
          type: 'STRING',
        },
        {
          name: 'hits__hit_id',
          aliasPath: 'sessions.hits',
          originalFieldName: 'hit_id',
          type: 'STRING',
        },
      ],
      availableSources: [
        { aliasPath: 'sessions', isIncluded: true },
        { aliasPath: 'sessions.hits', isIncluded: true },
      ],
    } as never);
    const context: BlendedQueryContext = {
      ...buildContext([sessionsChain, hitsChain], ['sessions__campaign', 'hits__hit_id']),
      fieldIndex,
    };

    const built = builder.sleeves().buildSleeveCte(
      { column: 'hits__hit_id', function: 'SUM' } as AggregationRule,
      [],
      context,
      new Map([
        ['sessions__campaign', 'sessions'],
        ['hits__hit_id', 'sessions'],
      ])
    );
    const sql = normalizeSql(built.sql);

    // The value read is the owner dedup CTE ALREADY-aggregated column, keyed by its pre-join
    // group key — never the raw hit ids.
    expect(sql).toContain('sessions_hits.hits__hit_id AS _val');
    expect(sql).not.toContain('hits_raw.hit_id AS _val');
    // A nested owner attaches to its PARENT raw CTE, not to main.
    expect(sql).toContain(
      'LEFT JOIN sessions_hits ON sessions_raw.session_id = sessions_hits.session_id'
    );
    // Non-identity owners never carry the row surrogate.
    expect(sql).not.toContain('__owox_rid');
  });

  it('keeps the bare per-column CTE name when only one COUNT_DISTINCT targets a chain', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const { sql } = builder.buildBlendedQuery({
      ...context,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    });

    expect(normalizeSql(sql)).toContain('sleeve_organizations__orgId AS (');
    expect(normalizeSql(sql)).not.toContain('_counts AS (');
  });

  it('gives two COUNT_DISTINCT metrics from the same chain distinct CTE names', () => {
    const builder = new TestBlendedQueryBuilder();
    const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
    const orgIdMetric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;
    const orgNameMetric = {
      column: 'organizations__name',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;

    const orgIdSleeve = builder
      .sleeves()
      .buildSleeveCte(orgIdMetric, ['users__country'], context, outputAliasToRoot);
    const orgNameSleeve = builder
      .sleeves()
      .buildSleeveCte(orgNameMetric, ['users__country'], context, outputAliasToRoot);

    // Both source from the SAME chain ('organizations'); if the CTE name were keyed by
    // chain, Task 4 would emit two `sleeve_organizations` CTEs in one WITH → SQL error.
    expect(orgIdSleeve.cteName).not.toBe(orgNameSleeve.cteName);
    expect(orgIdSleeve.cteName).toBe('sleeve_organizations__orgId');
    expect(orgNameSleeve.cteName).toBe('sleeve_organizations__name');
    // The emitted CTE header must match the returned cteName.
    expect(normalizeSql(orgIdSleeve.sql)).toContain('sleeve_organizations__orgId AS (');
    expect(normalizeSql(orgNameSleeve.sql)).toContain('sleeve_organizations__name AS (');
  });

  it('walks the FULL ancestor chain for a 2+-hop nested metric (main -> users -> organizations)', () => {
    // Unlike fixtureEventsUsersOrgs (both chains are ROOT siblings of main), here
    // `organizations` is nested UNDER `users` — mirrors the Task 5 integration topology
    // (events -> users -> organizations bridge). addWithAncestors must walk the FULL
    // parentAlias chain (organizations -> users -> main), not just the metric's own chain.
    const builder = new TestBlendedQueryBuilder();
    const usersChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-users',
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'userId' }],
      }),
      targetTableReference: 'users_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'country',
          outputAlias: 'users__country',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-organizations',
        targetAlias: 'organizations',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'users',
      blendedFields: [
        {
          targetFieldName: 'orgId',
          outputAlias: 'organizations__orgId',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    // cteName defaults (makeChain): 'users' (root) and 'users_organizations' (nested child).

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'users__country',
          aliasPath: 'users',
          originalFieldName: 'country',
          type: 'STRING',
        },
        {
          name: 'organizations__orgId',
          aliasPath: 'users.organizations',
          originalFieldName: 'orgId',
          type: 'STRING',
        },
      ],
      availableSources: [
        { aliasPath: 'users', isIncluded: true },
        { aliasPath: 'users.organizations', isIncluded: true },
      ],
    } as never);

    // Both outputAliases surface through the ROOT cte 'users' — mapOutputAliasesToRoot
    // stamps every blended field in the subtree (root + nested children) with the root's
    // OWN cteName, not the nested child's.
    const outputAliasToRoot = new Map([
      ['users__country', 'users'],
      ['organizations__orgId', 'users'],
    ]);

    const context: BlendedQueryContext = {
      ...buildContext([usersChain, organizationsChain], ['users__country', 'organizations__orgId']),
      fieldIndex,
    };
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;

    const sleeve = builder
      .sleeves()
      .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
    const sql = normalizeSql(sleeve.sql);

    // Every hop on the path is joined, in parent-before-child order: main -> users_raw
    // -> organizations_raw, each ON the correct hop's own joinConditions.
    const usersJoinPos = sql.indexOf('LEFT JOIN users_raw ON main.user_id = users_raw.userId');
    const orgsJoinPos = sql.indexOf(
      'LEFT JOIN users_organizations_raw ON users_raw.org_id = users_organizations_raw.orgId'
    );
    expect(usersJoinPos).toBeGreaterThan(-1);
    expect(orgsJoinPos).toBeGreaterThan(-1);
    expect(usersJoinPos).toBeLessThan(orgsJoinPos);

    // COUNT(DISTINCT) reads the LEAF metric's own raw ref (organizations, 2 hops down),
    // not an intermediate CTE.
    expect(sql).toContain(
      'COUNT(DISTINCT users_organizations_raw.orgId) AS `organizations__orgId | COUNTUNIQUE`'
    );
    // the dimension resolves through the DEDUP CTE `users` (root of users__country)
    // — the SAME `qualify` ref the outer GROUP BY uses. `users_raw` is still joined here, but
    // as the metric's RAW ancestor (users -> organizations), not for the dimension.
    expect(sql).toContain('LEFT JOIN users ON main.user_id = users.userId');
    expect(sql).toContain('GROUP BY users.users__country');
  });

  it('regression: throws a clear invariant error when the metric column has no fieldIndex entry', () => {
    // A hidden-but-aggregated column lands in `outputAliasToRoot` (mapOutputAliasesToRoot
    // walks every blended field unconditionally) but is SKIPPED by buildBlendedFieldIndex
    // (`if (field.isHidden) continue;`) — so a sleeve metric on it would previously hit a
    // bare `fieldIndex.get(metric.column)!` non-null assertion and throw a raw, unhelpful
    // TypeError instead of a clear invariant error.
    const builder = new TestBlendedWithRenderer();
    const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
    const fieldIndexWithoutMetric = new Map(context.fieldIndex);
    fieldIndexWithoutMetric.delete('organizations__orgId');
    const ctx: BlendedQueryContext = { ...context, fieldIndex: fieldIndexWithoutMetric };
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;

    expect(() =>
      builder.sleeves().buildSleeveCte(metric, ['users__country'], ctx, outputAliasToRoot)
    ).toThrow(
      /buildSleeveCte: no fieldIndex entry for sleeve metric column='organizations__orgId'/
    );
  });

  // `mergedMetrics` was trusted blind, though `buildSleeveCte` is PUBLIC and
  // derives the CTE's joins, WHERE and GROUP BY from `metric` alone — a merged metric owned by
  // another chain was counted over the wrong join closure, and a non-COUNT_DISTINCT one silently
  // came out as a COUNT DISTINCT. Only `buildAll`'s grouping guaranteed the invariant.
  describe('mergedMetrics invariant', () => {
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;
    const dims = ['users__country'];

    const buildMerged = (merged: AggregationRule[]) => {
      const sleeves = new TestBlendedQueryBuilder().sleeves();
      const { context: ctx, outputAliasToRoot: roots } = fixtureEventsUsersOrgs();
      return sleeves.buildSleeveCte(metric, dims, ctx, roots, undefined, undefined, merged);
    };

    it('rejects a merged metric owned by a DIFFERENT chain', () => {
      const foreignOwner = {
        column: 'users__country',
        function: 'COUNT_DISTINCT',
      } as AggregationRule;
      const build = () => buildMerged([metric, foreignOwner]);

      expect(build).toThrow(/COUNT_DISTINCT\(users__country\)/);
      expect(build).toThrow(/owner cteName='organizations'/);
    });

    it('rejects a merged metric whose function is not COUNT_DISTINCT', () => {
      const valueMetric = {
        column: 'organizations__name',
        function: 'SUM',
      } as AggregationRule;

      expect(() => buildMerged([metric, valueMetric])).toThrow(/SUM\(organizations__name\)/);
    });

    it('accepts merged COUNT_DISTINCT metrics that share the owner chain', () => {
      const sameOwner = {
        column: 'organizations__name',
        function: 'COUNT_DISTINCT',
      } as AggregationRule;

      const sleeve = buildMerged([metric, sameOwner]);

      expect(sleeve.pulls.map(p => p.alias)).toEqual([
        'organizations__orgId | COUNTUNIQUE',
        'organizations__name | COUNTUNIQUE',
      ]);
    });
  });

  it('regression: dimRefs.outer applies the SAME date-trunc as the sleeve GROUP BY for a date-trunc dimension', () => {
    // buildSleeveCte used to build dimRefs.outer as a bare, untruncated column ref even
    // when the dimension carries a dateTruncs entry, while BOTH the sleeve's own GROUP BY
    // (via renderDimensionExpr on the raw ref) and the outer aggregated GROUP BY (via
    // renderAggregatedSelect) truncate it. That mismatch means the NULL-safe join-back in
    // buildBlendedQuery compares a raw value against a truncated one on the outer side and
    // never matches, so the sleeve metric comes back NULL for every row.
    const builder = new TestBlendedWithRenderer();
    const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
    const metric = {
      column: 'organizations__orgId',
      function: 'COUNT_DISTINCT',
    } as AggregationRule;
    const ctx: BlendedQueryContext = {
      ...context,
      dateTruncs: [{ column: 'users__country', unit: 'MONTH' }],
    };

    const sleeve = builder
      .sleeves()
      .buildSleeveCte(metric, ['users__country'], ctx, outputAliasToRoot);

    // Both sides of dimRefs carry the identical DATE_TRUNC(..., MONTH) shape, and the
    // sleeve's own GROUP BY now renders it against the SAME qualified (dedup CTE) ref
    // so it is byte-identical to the outer GROUP BY.
    expect(sleeve.dimRefs).toEqual([
      {
        column: 'users__country',
        outer: 'DATE_TRUNC(DATE(users.users__country), MONTH)',
        sleeve: 'sleeve_organizations__orgId._owox_dim_0',
      },
    ]);
    expect(normalizeSql(sleeve.sql)).toContain(
      'GROUP BY DATE_TRUNC(DATE(users.users__country), MONTH)'
    );
  });

  // pin: a report-level COUNT_DISTINCT on a blended field with a NON-IDENTITY
  // pre-join roll-up (here STRING_AGG — the field's OWN dedup CTE combines several raw
  // values into one rolled-up string per join key) still counts distinct RAW values, not
  // distinct ROLLED-UP values. This is the DECIDED behaviour (more correct at the
  // report grain than counting distinct concatenated strings, though the number differs
  // from a pre-sleeve report). Unlike the SUM/AVG value sleeve, the
  // COUNT_DISTINCT branch of `buildSleeveCte` does NOT branch on `isIdentityPreJoinField` —
  // pin that here so a future "symmetric" identity/non-identity split can't silently slip
  // in and regress it (constraint: keep raw-distinct, do not add the branch).
  it('COUNT_DISTINCT on a NON-IDENTITY pre-join field (STRING_AGG) counts distinct RAW values via the sleeve (, decided behaviour)', () => {
    const builder = new TestBlendedWithRenderer();
    const tagsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-tags',
        targetAlias: 'tags',
        joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
      }),
      targetTableReference: 'tags_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'tag',
          outputAlias: 'tags__tag',
          isHidden: false,
          aggregateFunction: 'STRING_AGG', // non-identity: rolls up to 'a, b' per order_id
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'tags__tag', aliasPath: 'tags', originalFieldName: 'tag', type: 'STRING' },
      ],
      availableSources: [{ aliasPath: 'tags', isIncluded: true }],
    } as never);
    const outputAliasToRoot = new Map([['tags__tag', 'tags']]);
    const context: BlendedQueryContext = {
      ...buildContext([tagsChain], ['tags__tag']),
      fieldIndex,
    };
    const metric = { column: 'tags__tag', function: 'COUNT_DISTINCT' } as AggregationRule;

    const sleeve = builder.sleeves().buildSleeveCte(metric, [], context, outputAliasToRoot);
    const sql = normalizeSql(sleeve.sql);

    // The RAW (pre-roll-up) column, not the dedup CTE's own rolled-up `tags.tags__tag`.
    expect(sql).toContain('COUNT(DISTINCT tags_raw.tag)');
    expect(sql).not.toContain('COUNT(DISTINCT tags.tags__tag)');
  });

  // C2.2: SUM/AVG "value sleeve" — a nested `SELECT DISTINCT dims, owner __owox_rid, value`
  // subquery wrapped by an outer SUM/AVG, instead of the single-level COUNT_DISTINCT form
  // above. Reuses fixtureEventsUsersOrgs (dim: users__country · metric column:
  // organizations__orgId) — the SQL shape under test doesn't depend on the metric
  // column's real semantic type.
  describe('value sleeve (SUM/AVG)', () => {
    it('SUM: emits an inner SELECT DISTINCT with __owox_rid + value, wrapped by an outer SUM', () => {
      const builder = new TestBlendedQueryBuilder();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sleeve.cteName).toBe('sleeve_organizations__orgId');
      expect(sleeve.alias).toBe('organizations__orgId | SUM');
      // Inner subquery: DISTINCT dims + owner-identity (__owox_rid) + the raw value.
      // the dimension resolves through the DEDUP CTE `users` (qualify ref), NOT `users_raw`
      // — byte-identical to the outer GROUP BY. `__owox_rid`/value still come from the raw path.
      expect(sql).toContain('SELECT DISTINCT users.users__country AS _owox_dim_0');
      expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('organizations_raw.orgId AS _val');
      expect(sql).toContain('LEFT JOIN users ON main.user_id = users.userId');
      expect(sql).not.toContain('users_raw');
      expect(sql).toContain('LEFT JOIN organizations_raw ON main.org_id = organizations_raw.orgId');
      // Outer wrapper: SUM over the deduped value, grouped by the dimension's own alias
      // (not a re-rendered raw expression — only the subquery's SELECT list is in scope).
      expect(sql).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(sql).toContain('GROUP BY _owox_dim_0');
      // dimRefs contract is unchanged by the branch — same shape as the COUNT_DISTINCT sleeve.
      expect(sleeve.dimRefs).toEqual([
        {
          column: 'users__country',
          outer: 'users.users__country',
          sleeve: 'sleeve_organizations__orgId._owox_dim_0',
        },
      ]);
    });

    it('P50: wraps the same inner value-dedup subquery with the dialect percentile form', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'P50' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sleeve.alias).toBe('organizations__orgId | MEDIAN');
      expect(sql).toContain('SELECT DISTINCT users.users__country AS _owox_dim_0');
      expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('organizations_raw.orgId AS _val');
      expect(sql).toContain(
        'APPROX_QUANTILES(_val, 100)[OFFSET(50)] AS `organizations__orgId | MEDIAN`'
      );
      expect(sql).toContain('GROUP BY _owox_dim_0');
    });

    it('merges a percentile with SUM/AVG on the same column into ONE dedup pass', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

      const sleeves = builder.sleeves().buildAll(
        [
          { column: 'organizations__orgId', function: 'SUM' },
          { column: 'organizations__orgId', function: 'P75' },
        ] as AggregationRule[],
        { ...context, columns: ['users__country', 'organizations__orgId'] },
        { outputAliasToRoot, filters: [] }
      );

      expect(sleeves).toHaveLength(1);
      const sql = normalizeSql(sleeves[0].sql);
      expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
      expect(sql.match(/AS _val/g)).toHaveLength(1);
      expect(sql).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(sql).toContain(
        'APPROX_QUANTILES(_val, 100)[OFFSET(75)] AS `organizations__orgId | P75`'
      );
      expect(sleeves[0].pulls.map(p => p.metric.function)).toEqual(['SUM', 'P75']);
    });

    // The dedup pass projects every merged metric's value column and `SELECT DISTINCT` spans
    // the whole tuple, so two columns in one pass make a difference in EITHER one a difference
    // in the dedup set. With a declared primary key as the identity, two raw rows that are
    // duplicates by that key but differ in the second column then survive as two rows and
    // inflate the first column's SUM.
    describe('one dedup pass per metric column', () => {
      const declaredPkFixture = (): {
        context: BlendedQueryContext;
        outputAliasToRoot: ReadonlyMap<string, string>;
      } => {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
        return {
          outputAliasToRoot,
          context: {
            ...context,
            columns: ['users__country', 'organizations__orgId', 'organizations__name'],
            chains: context.chains.map(c =>
              c.cteName === 'organizations' ? { ...c, targetPrimaryKeyFields: ['orgKey'] } : c
            ),
          },
        };
      };

      const buildAllFor = (metrics: AggregationRule[]) => {
        const { context, outputAliasToRoot } = declaredPkFixture();
        const ctx = { ...context, aggregations: metrics };
        const opts = { outputAliasToRoot, filters: [] };
        return new TestBlendedWithRenderer().sleeves().buildAll(metrics, ctx, opts);
      };

      it('gives two metrics on DIFFERENT columns of one owner their own dedup pass', () => {
        const sleeves = buildAllFor([
          { column: 'organizations__orgId', function: 'SUM' },
          { column: 'organizations__name', function: 'SUM' },
        ] as AggregationRule[]);
        const combined = normalizeSql(sleeves.map(s => s.sql).join('\n'));

        expect(sleeves.map(s => s.cteName)).toEqual([
          'sleeve_organizations__orgId',
          'sleeve_organizations__name',
        ]);
        expect(combined.match(/SELECT DISTINCT/g)).toHaveLength(2);
        // Each pass carries ONE value slot — its own column, never the other's.
        expect(combined).not.toContain('_val_0');
        expect(normalizeSql(sleeves[0].sql)).toContain('organizations_raw.orgId AS _val');
        expect(normalizeSql(sleeves[0].sql)).not.toContain('organizations_raw.name');
        expect(normalizeSql(sleeves[1].sql)).toContain('organizations_raw.name AS _val');
      });

      it('still merges every function on the SAME column into one dedup pass', () => {
        const sleeves = buildAllFor([
          { column: 'organizations__orgId', function: 'SUM' },
          { column: 'organizations__orgId', function: 'AVG' },
          { column: 'organizations__orgId', function: 'P75' },
        ] as AggregationRule[]);

        expect(sleeves).toHaveLength(1);
        const sql = normalizeSql(sleeves[0].sql);
        expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
        expect(sql.match(/AS _val/g)).toHaveLength(1);
        expect(sleeves[0].pulls.map(p => p.metric.function)).toEqual(['SUM', 'AVG', 'P75']);
      });
    });

    // MIN/MAX read the joined column through the SAME dedup pass as SUM/AVG, so all three are
    // measured at one grain; off the sleeve MIN/MAX read the pre-join roll-up's single collapsed
    // value and `MIN <= AVG <= MAX` can fail.
    it('MIN/MAX: aggregate the same deduped value slot as AVG on that column', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metrics = [
        { column: 'organizations__orgId', function: 'MIN' },
        { column: 'organizations__orgId', function: 'MAX' },
        { column: 'organizations__orgId', function: 'AVG' },
      ] as AggregationRule[];

      const ctx = { ...context, aggregations: metrics };
      const sleeves = builder.sleeves().buildAll(metrics, ctx, { outputAliasToRoot, filters: [] });

      expect(sleeves).toHaveLength(1);
      const sql = normalizeSql(sleeves[0].sql);
      expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
      expect(sql).toContain('organizations_raw.orgId AS _val');
      expect(sql).toContain('MIN(_val) AS `organizations__orgId | MIN`');
      expect(sql).toContain('MAX(_val) AS `organizations__orgId | MAX`');
      expect(sql).toContain('AVG(_val) AS `organizations__orgId | AVG`');
    });

    it('keeps equal values from DIFFERENT owner rows, which is what a percentile weighs', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'P50' } as AggregationRule;

      const sql = normalizeSql(
        builder.sleeves().buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot).sql
      );

      expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('organizations_raw.orgId AS _oid_key_0');
    });

    it('AVG: wraps the same inner value-dedup subquery with an outer AVG', () => {
      const builder = new TestBlendedQueryBuilder();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'AVG' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sleeve.alias).toBe('organizations__orgId | AVG');
      expect(sql).toContain('SELECT DISTINCT users.users__country AS _owox_dim_0');
      expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('organizations_raw.orgId AS _val');
      expect(sql).toContain('AVG(_val) AS `organizations__orgId | AVG`');
      expect(sql).not.toContain('SUM(_val)');
      expect(sql).toContain('GROUP BY _owox_dim_0');
    });

    it('walks the FULL ancestor chain for a 2+-hop nested value-sleeve owner (main -> users -> organizations)', () => {
      // Mirrors the COUNT_DISTINCT nested-chain test above, for the SUM/AVG value sleeve:
      // `organizations` is nested UNDER `users`, so the owner's raw ancestor closure
      // (`buildSleeveAncestorJoins`) must walk BOTH hops (main -> users_raw ->
      // users_organizations_raw), not just the metric's own immediate chain.
      const builder = new TestBlendedQueryBuilder();
      const usersChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-users',
          targetAlias: 'users',
          joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'userId' }],
        }),
        targetTableReference: 'users_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'country',
            outputAlias: 'users__country',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const organizationsChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-organizations',
          targetAlias: 'organizations',
          joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
        }),
        targetTableReference: 'organizations_table',
        parentAlias: 'users',
        blendedFields: [
          {
            targetFieldName: 'revenue',
            outputAlias: 'organizations__revenue',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE', // identity — the __owox_rid path under test
          },
        ],
      });
      // cteName defaults (makeChain): 'users' (root) and 'users_organizations' (nested child).

      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__country',
            aliasPath: 'users',
            originalFieldName: 'country',
            type: 'STRING',
          },
          {
            name: 'organizations__revenue',
            aliasPath: 'users.organizations',
            originalFieldName: 'revenue',
            type: 'FLOAT64',
          },
        ],
        availableSources: [
          { aliasPath: 'users', isIncluded: true },
          { aliasPath: 'users.organizations', isIncluded: true },
        ],
      } as never);

      const outputAliasToRoot = new Map([
        ['users__country', 'users'],
        ['organizations__revenue', 'users'],
      ]);

      const context: BlendedQueryContext = {
        ...buildContext(
          [usersChain, organizationsChain],
          ['users__country', 'organizations__revenue']
        ),
        fieldIndex,
      };
      const metric = { column: 'organizations__revenue', function: 'SUM' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      // Every hop is joined, in parent-before-child order.
      const usersJoinPos = sql.indexOf('LEFT JOIN users_raw ON main.user_id = users_raw.userId');
      const orgsJoinPos = sql.indexOf(
        'LEFT JOIN users_organizations_raw ON users_raw.org_id = users_organizations_raw.orgId'
      );
      expect(usersJoinPos).toBeGreaterThan(-1);
      expect(orgsJoinPos).toBeGreaterThan(-1);
      expect(usersJoinPos).toBeLessThan(orgsJoinPos);

      // Identity + value legs come off the LEAF owner (2 hops down), not an intermediate CTE.
      expect(sql).toContain('users_organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('users_organizations_raw.revenue AS _val');
      // Dimension resolves through the ROOT dedup CTE `users` — the same qualify ref the
      // outer GROUP BY uses.
      expect(sql).toContain('SELECT DISTINCT users.users__country AS _owox_dim_0');
      expect(sql).toContain('GROUP BY _owox_dim_0');
    });

    // the surrogate is numbered per parent-join-key group, so the DISTINCT tuple
    // must carry that key — one `_oid_key_<i>` slot per key column. Without it, row 1 of key A
    // and row 1 of key B with the same value collapse into one row and the SUM loses one.
    it('carries every column of a COMPOSITE join key alongside the surrogate', () => {
      const builder = new TestBlendedQueryBuilder();
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [
            { sourceFieldName: 'tenant_id', targetFieldName: 'tenant_id' },
            { sourceFieldName: 'order_id', targetFieldName: 'order_id' },
          ],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'orders__amount',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__amount',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            type: 'NUMERIC',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);
      const context: BlendedQueryContext = {
        ...buildContext([chain], ['orders__amount']),
        fieldIndex,
        aggregations: [{ column: 'orders__amount', function: 'SUM' } as AggregationRule],
      };

      const built = builder
        .sleeves()
        .buildSleeveCte(
          { column: 'orders__amount', function: 'SUM' } as AggregationRule,
          [],
          context,
          new Map([['orders__amount', 'orders']])
        );

      expect(normalizeSql(built.sql)).toContain(
        'SELECT DISTINCT orders_raw.__owox_rid AS _oid, ' +
          'orders_raw.tenant_id AS _oid_key_0, orders_raw.order_id AS _oid_key_1, ' +
          'orders_raw.amount AS _val'
      );
    });

    it('grand-total (no dims): inner DISTINCT __owox_rid + value, outer SUM with NO GROUP BY, dimRefs empty', () => {
      const builder = new TestBlendedQueryBuilder();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      const sleeve = builder.sleeves().buildSleeveCte(metric, [], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sql).toContain(
        'SELECT DISTINCT organizations_raw.__owox_rid AS _oid, ' +
          'organizations_raw.orgId AS _oid_key_0, organizations_raw.orgId AS _val'
      );
      expect(sql).toContain('LEFT JOIN organizations_raw ON main.org_id = organizations_raw.orgId');
      // No dimension in play → the ancestor-closure for `users` is never pulled in.
      expect(sql).not.toContain('users_raw');
      expect(sql).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(sql).not.toMatch(/GROUP BY/);
      expect(sleeve.dimRefs).toEqual([]);
    });

    it('regression: the inner DISTINCT dimension expression is byte-identical to the outer GROUP BY dimension (date-trunc case)', () => {
      // Mirrors the COUNT_DISTINCT sleeve's critical date-trunc fix: the value sleeve's
      // inner subquery must render the dimension with the SAME renderDimensionExpr call
      // (same date-trunc shape) as dimRefs.outer / the caller's outer GROUP BY — otherwise
      // the eventual join-back in buildBlendedQuery (C2.3) never matches.
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;
      const ctx: BlendedQueryContext = {
        ...context,
        dateTruncs: [{ column: 'users__country', unit: 'MONTH' }],
      };

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], ctx, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sleeve.dimRefs).toEqual([
        {
          column: 'users__country',
          outer: 'DATE_TRUNC(DATE(users.users__country), MONTH)',
          sleeve: 'sleeve_organizations__orgId._owox_dim_0',
        },
      ]);
      // Inner subquery renders the SAME DATE_TRUNC shape against the SAME qualified (dedup
      // CTE) ref as the outer GROUP BY, keyed to the dimension's output alias.
      expect(sql).toContain(
        'SELECT DISTINCT DATE_TRUNC(DATE(users.users__country), MONTH) AS _owox_dim_0'
      );
      // The outer wrapper groups by that alias, not by re-rendering the raw expression again.
      expect(sql).toContain('GROUP BY _owox_dim_0');
      expect(sql).not.toMatch(/GROUP BY DATE_TRUNC/);
    });

    // the reserved-alias guard compared EXACT case. `quoteIdentifier` leaves these
    // safe identifiers UNQUOTED, and Athena/Redshift then fold them to lower case while Spark
    // resolves identifiers case-insensitively — so a dimension named `_OID` slipped past the
    // guard and collided with the synthetic alias inside the SELECT DISTINCT, silently corrupting
    // the dedup set instead of failing.
    describe('de-duplication by a declared primary key', () => {
      function fixtureWithOrgPrimaryKey(primaryKeyColumns: string[]) {
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
        return {
          outputAliasToRoot,
          context: {
            ...context,
            chains: context.chains.map(c =>
              c.cteName === 'organizations'
                ? { ...c, targetPrimaryKeyFields: primaryKeyColumns }
                : c
            ),
          },
        };
      }

      it('keys the DISTINCT tuple on the declared key instead of the row surrogate', () => {
        const builder = new TestBlendedQueryBuilder();
        const { context, outputAliasToRoot } = fixtureWithOrgPrimaryKey(['orgKey']);
        const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

        const sql = normalizeSql(
          builder.sleeves().buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot)
            .sql
        );

        expect(sql).toContain('organizations_raw.orgKey AS _oid');
        expect(sql).not.toContain('__owox_rid');
        expect(sql).toContain('organizations_raw.orgId AS _oid_key_0');
      });

      it('gives a composite key one slot per column', () => {
        const builder = new TestBlendedQueryBuilder();
        const { context, outputAliasToRoot } = fixtureWithOrgPrimaryKey(['tenant', 'orgKey']);
        const metric = { column: 'organizations__orgId', function: 'AVG' } as AggregationRule;

        const sql = normalizeSql(
          builder.sleeves().buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot)
            .sql
        );

        expect(sql).toContain('organizations_raw.tenant AS _oid_0');
        expect(sql).toContain('organizations_raw.orgKey AS _oid_1');
        expect(sql).not.toContain('__owox_rid');
      });

      it('still uses the surrogate when the joined mart declares no key', () => {
        const builder = new TestBlendedQueryBuilder();
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
        const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

        const sql = normalizeSql(
          builder.sleeves().buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot)
            .sql
        );

        expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
        expect(sql).toContain('organizations_raw.orgId AS _oid_key_0');
      });

      it('ignores a declared key on a NON-IDENTITY owner, which is keyed by its pre-join group key', () => {
        const builder = new TestBlendedQueryBuilder();
        const chain = makeChain({
          relationship: makeRelationship({
            targetAlias: 'hits',
            joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
          }),
          targetTableReference: 'hits_table',
          parentAlias: 'main',
          targetPrimaryKeyFields: ['hit_id'],
          blendedFields: [
            {
              targetFieldName: 'amount',
              outputAlias: 'hits__amount',
              isHidden: false,
              aggregateFunction: 'SUM', // non-identity pre-join roll-up
            },
          ],
        });
        const fieldIndex = buildBlendedFieldIndex({
          blendedFields: [
            {
              name: 'hits__amount',
              aliasPath: 'hits',
              originalFieldName: 'amount',
              type: 'FLOAT64',
            },
          ],
          availableSources: [{ aliasPath: 'hits', isIncluded: true }],
        } as never);
        const context: BlendedQueryContext = {
          ...buildContext([chain], ['hits__amount']),
          fieldIndex,
        };
        const metric = { column: 'hits__amount', function: 'SUM' } as AggregationRule;

        const sql = normalizeSql(
          builder.sleeves().buildSleeveCte(metric, [], context, new Map([['hits__amount', 'hits']]))
            .sql
        );

        expect(sql).toContain('hits.session_id AS _oid');
        expect(sql).not.toContain('hit_id');
      });
    });

    describe('reserved inner alias guard is case-insensitive', () => {
      const buildGroup = (dimensions: string[]) => {
        const sleeves = new TestBlendedQueryBuilder().sleeves();
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
        const group = {
          ownerCteName: 'organizations',
          dimensions,
          metrics: [{ column: 'organizations__orgId', function: 'SUM' } as AggregationRule],
        };
        return sleeves.buildValueSleeveGroupCte(group, context, outputAliasToRoot, 'sleeve_x');
      };

      it('rejects dimensions differing from a reserved alias only by case', () => {
        const build = () => buildGroup(['_OID', '_Val']);

        expect(build).toThrow(BusinessViolationException);
        // Reported in the user's OWN spelling — that is the field they have to find and rename.
        expect(build).toThrow(/_OID, _Val/);
      });

      it('does NOT reject a dimension that merely starts with a reserved alias', () => {
        expect(() => buildGroup(['_OID_EXTRA'])).not.toThrow();
      });

      // The empty set defaulted to `identity` and built the CTE anyway — a dedup subquery with
      // no aggregate over it. The planner never produces such a group, so it is an internal
      // invariant, not user data.
      it('refuses a group that carries no metrics at all', () => {
        const sleeves = new TestBlendedQueryBuilder().sleeves();
        const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();

        expect(() =>
          sleeves.buildValueSleeveGroupCte(
            { ownerCteName: 'organizations', dimensions: [], metrics: [] },
            context,
            outputAliasToRoot,
            'sleeve_x'
          )
        ).toThrow(/carries no metrics/);
      });

      // The MCP path must never forward a raw exception message (it can carry SQL and
      // identifiers), so it names the column from `errorDetails` alone. Drop the key and that
      // guidance silently degrades to an opaque "query failed".
      it('carries the colliding dimensions in errorDetails for callers that cannot forward the message', () => {
        try {
          buildGroup(['_OID', '_Val']);
          throw new Error('expected a BusinessViolationException');
        } catch (err) {
          expect(err).toBeInstanceOf(BusinessViolationException);
          expect((err as BusinessViolationException).errorDetails).toEqual({
            reservedNameColumns: ['_OID', '_Val'],
          });
        }
      });
    });
  });

  // + C2: the sleeve must (C1) reproduce the report's post-join WHERE inside its
  // OWN subquery — the metric is pulled via ANY_VALUE, a constant per dimension group the
  // outer WHERE cannot reach, so an outer-only WHERE leaves the metric unfiltered — and (C2)
  // project its dimension from the SAME `qualify` (dedup CTE) ref the outer GROUP BY uses, so
  // a fanning blended dimension's roll-up matches instead of a raw value that never joins
  // back. All prior fixtures are 1-row-per-key, which HID C2; these pin the by-construction
  // identity directly (and would fail against the pre-fix raw-ref / no-WHERE sleeve).
  describe('/C2 — post-join filters + outer dimension grain', () => {
    const eq = (column: string, value: string): FilterRule =>
      ({ column, operator: 'eq', value, placement: 'post-join' }) as FilterRule;

    it('C2 (COUNT_DISTINCT): the sleeve projects + groups by dimRefs.outer (dedup qualify ref), never the raw ref', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = {
        column: 'organizations__orgId',
        function: 'COUNT_DISTINCT',
      } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);
      const outerDim = sleeve.dimRefs[0].outer;

      // The sleeve's projected dimension and its GROUP BY are BYTE-IDENTICAL to dimRefs.outer
      // (the dedup CTE ref) — so a fanning blended dim's roll-up ('A, B') on the outer side
      // equals the sleeve's projection, and the NULL-safe join-back matches.
      expect(outerDim).toBe('users.users__country');
      expect(sql).toContain(`${outerDim} AS _owox_dim_0`);
      expect(sql).toContain(`GROUP BY ${outerDim}`);
      // Pre-fix bug: the sleeve projected the RAW value ('A'), which never equalled the outer
      // roll-up ('A, B') for a fanning dimension → NULL metric.
      expect(sql).not.toContain('users_raw');
    });

    it('C2 (SUM value sleeve): the inner DISTINCT projects dimRefs.outer (dedup qualify ref); __owox_rid + value stay on the raw path', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);
      const outerDim = sleeve.dimRefs[0].outer;

      expect(outerDim).toBe('users.users__country');
      expect(sql).toContain(`SELECT DISTINCT ${outerDim} AS _owox_dim_0`);
      // The metric identity + value still come from the RAW owner path (the fan-out source).
      expect(sql).toContain('organizations_raw.__owox_rid AS _oid');
      expect(sql).toContain('organizations_raw.orgId AS _val');
      expect(sql).not.toContain('users_raw');
    });

    it('C1 (COUNT_DISTINCT): renders the post-join WHERE INSIDE the sleeve, before GROUP BY, with a per-sleeve param prefix', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = {
        column: 'organizations__orgId',
        function: 'COUNT_DISTINCT',
      } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot, undefined, {
          filters: [eq('main_region', 'US')],
          whereParamPrefix: 'slv0p',
        });
      const sql = normalizeSql(sleeve.sql);

      expect(sql).toContain('WHERE main.main_region = @slv0p0');
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY'));
      expect(sleeve.params).toEqual([{ name: 'slv0p0', value: 'US' }]);
    });

    it('C1 (SUM value sleeve): renders the post-join WHERE INSIDE the inner DISTINCT dedup subquery', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = { column: 'organizations__orgId', function: 'SUM' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['users__country'], context, outputAliasToRoot, undefined, {
          filters: [eq('main_region', 'US')],
          whereParamPrefix: 'slv0p',
        });
      const sql = normalizeSql(sleeve.sql);

      // The WHERE is inside the dedup subquery (before the `_dedup` alias), so the DISTINCT
      // set — and thus the outer SUM — is over the filtered rows only.
      expect(sql).toContain('WHERE main.main_region = @slv0p0');
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('_dedup'));
      expect(sleeve.params).toEqual([{ name: 'slv0p0', value: 'US' }]);
    });

    it('C1 (blended filter column): the sleeve joins the filter column’s dedup CTE so `qualify` resolves it', () => {
      // A post-join WHERE on a BLENDED column (users__country) resolves via `qualify` to the
      // dedup CTE `users` — which the sleeve must join even though it is not a dimension here.
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureEventsUsersOrgs();
      const metric = {
        column: 'organizations__orgId',
        function: 'COUNT_DISTINCT',
      } as AggregationRule;

      const sleeve = builder.sleeves().buildSleeveCte(
        metric,
        [], // dimensionless: users__country appears ONLY as a filter, not a GROUP BY key
        context,
        outputAliasToRoot,
        undefined,
        { filters: [eq('users__country', 'US')], whereParamPrefix: 'slv0p' }
      );
      const sql = normalizeSql(sleeve.sql);

      expect(sql).toContain('LEFT JOIN users ON main.user_id = users.userId');
      expect(sql).toContain('WHERE users.users__country = @slv0p0');
      expect(sleeve.params).toEqual([{ name: 'slv0p0', value: 'US' }]);
    });

    it('C1 (param order): a filtered report emits sleeve WHERE params BEFORE the outer WHERE params', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
        ],
        filters: [eq('main_region', 'US')],
      };

      const { sql, params } = builder.buildBlendedQuery(ctx);

      // The sleeve WHERE (`@slv0p0`, in the WITH clause) appears BEFORE the outer WHERE
      // (`@p0`, in the final body) in the SQL text...
      expect(sql.indexOf('@slv0p0')).toBeGreaterThan(-1);
      expect(sql.indexOf('@slv0p0')).toBeLessThan(sql.indexOf('@p0'));
      // ...and the params array is ordered to match (sleeve first, outer second), so
      // positional (Athena `?`) binding stays aligned with WITH-clause order.
      expect(params).toEqual([
        { name: 'slv0p0', value: 'US' },
        { name: 'p0', value: 'US' },
      ]);
    });
  });
});
