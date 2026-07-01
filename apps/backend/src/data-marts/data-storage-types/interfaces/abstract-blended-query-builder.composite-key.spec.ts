/**
 * Composite-key funnel demo — locking test (DoD B)
 *
 * Scenario: "sessions × events" multi-fact funnel
 * ─────────────────────────────────────────────────
 * Two pre-aggregated data marts, each already rolled up to the grain
 * [date, source, medium]:
 *
 *   sessions_by_dimensions (MAIN)
 *     dimensions: date, source, medium
 *     metric:     sessions
 *
 *   events_by_dimensions (JOINED subsidiary)
 *     dimensions: date, source, medium
 *     metric:     events
 *
 * The relationship joins them on ALL THREE dimension columns — the COMPOSITE
 * key. Because every row in the main mart has at most one matching row in the
 * events mart (grain is identical), the LEFT JOIN is 1-to-1: sessions is
 * NOT multiplied.
 *
 * This is NOT a new product feature — the blended builder already supports
 * multi-condition joins (iterates `relationship.joinConditions`) and post-join
 * aggregation (Task 8). This file DEMONSTRATES + LOCKS the scenario so any
 * future regression that breaks the composite-key mechanism is immediately
 * caught.
 *
 * Assertions:
 *   1. Composite-key join: the ON clause contains all 3 equalities (AND-joined).
 *   2. No row multiplication: the events CTE GROUP BY covers the full composite
 *      key → each main row matches at most one events CTE row.
 *   3. Post-join aggregation on top works (SUM metrics, GROUP BY dimensions).
 *   4. Plain (no post-join agg) variant: 1-to-1 join still produces correct SQL.
 */

import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from './__fixtures__/blended-query-builder-fixtures';
import { AbstractBlendedQueryBuilder } from './abstract-blended-query-builder';
import { BlendedQueryContext } from './blended-query-builder.interface';
import { SqlClauseRenderer } from '../utils/sql-clause-renderer';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';

class TestBlendedWithRenderer extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected get clauseRenderer(): SqlClauseRenderer {
    return new BigQueryClauseRenderer();
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

const buildContext = createBuildContext('sessions_table');

/** Returns the chain definition for the events_by_dimensions subsidiary mart. */
function makeEventsChain() {
  return makeChain({
    relationship: makeRelationship({
      id: 'rel-events',
      targetAlias: 'events',
      // Composite key: all 3 dimension columns must appear in the ON clause.
      joinConditions: [
        { sourceFieldName: 'date', targetFieldName: 'date' },
        { sourceFieldName: 'source', targetFieldName: 'source' },
        { sourceFieldName: 'medium', targetFieldName: 'medium' },
      ],
    }),
    targetTableReference: 'events_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'events',
        outputAlias: 'events__events',
        isHidden: false,
        aggregateFunction: 'SUM',
      },
    ],
  });
}

/** Context for plain (no post-join agg) blend. */
function makePlainCtx(): BlendedQueryContext {
  return buildContext(
    [makeEventsChain()],
    ['date', 'source', 'medium', 'sessions', 'events__events']
  );
}

/** Context with post-join aggregation on both metrics. */
function makeAggCtx(): BlendedQueryContext {
  return {
    ...makePlainCtx(),
    aggregations: [
      { column: 'sessions', function: 'SUM' },
      { column: 'events__events', function: 'SUM' },
    ],
  };
}

describe('AbstractBlendedQueryBuilder — composite-key funnel (sessions × events)', () => {
  let builder: TestBlendedWithRenderer;

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  // ── Assertion 4: plain blend (no post-join aggregation) ────────────────────

  describe('plain blend (no post-join aggregation)', () => {
    it('ON clause contains all 3 equalities (composite key, AND-joined)', () => {
      const { sql } = builder.buildBlendedQuery(makePlainCtx());

      // All three conditions must appear in the ON clause, joined by AND.
      // The order mirrors the joinConditions array: date, source, medium.
      expect(sql).toContain(
        'ON main.date = events.date AND main.source = events.source AND main.medium = events.medium'
      );
    });

    it('events CTE GROUP BY covers the full composite key (1-to-1 guarantee)', () => {
      const { sql } = builder.buildBlendedQuery(makePlainCtx());

      // The subsidiary aggregation CTE must GROUP BY all three join-key columns
      // (in joinConditions target-field order) so each main row matches at most
      // one events row → sessions cannot be multiplied.
      expect(sql).toContain('GROUP BY date, source, medium');
    });

    it('the final SELECT exposes main dimensions and the aggregated events metric', () => {
      const { sql } = builder.buildBlendedQuery(makePlainCtx());

      expect(sql).toContain('main.date');
      expect(sql).toContain('main.source');
      expect(sql).toContain('main.medium');
      expect(sql).toContain('main.sessions');
      expect(sql).toContain('events.events__events');
      // The events subsidiary must aggregate with SUM (not passthrough)
      expect(sql).toContain('SUM(events) AS events__events');
    });

    it('does not apply outer GROUP BY (no post-join aggregation requested)', () => {
      const { sql } = builder.buildBlendedQuery(makePlainCtx());

      // Without aggregations config, no outer GROUP BY should appear.
      expect(sql).not.toContain('GROUP BY main.date');
      expect(sql).not.toContain(' | ');
    });
  });

  // ── Assertions 1–3: post-join aggregation on top ───────────────────────────

  describe('with post-join aggregation', () => {
    it('outer SELECT groups by the composite dimensions (qualified with main.)', () => {
      const { sql } = builder.buildBlendedQuery(makeAggCtx());

      // Dimensions in the outer GROUP BY must be qualified with the main alias.
      // Order mirrors the column list order (date, source, medium).
      expect(sql).toContain('GROUP BY\n  main.date,\n  main.source,\n  main.medium');
    });

    it('outer SELECT emits SUM(main.sessions) with aggregated-by alias', () => {
      const { sql } = builder.buildBlendedQuery(makeAggCtx());

      expect(sql).toContain('SUM(main.sessions) AS `sessions | SUM`');
    });

    it('outer SELECT emits SUM(events.events__events) via the events CTE with aggregated-by alias', () => {
      const { sql } = builder.buildBlendedQuery(makeAggCtx());

      expect(sql).toContain('SUM(events.events__events) AS `events__events | SUM`');
    });

    it('the composite-key ON clause and subsidiary GROUP BY are unchanged under post-join agg', () => {
      const { sql } = builder.buildBlendedQuery(makeAggCtx());

      // Inner structure: still 3-condition join
      expect(sql).toContain(
        'ON main.date = events.date AND main.source = events.source AND main.medium = events.medium'
      );
      // Inner structure: subsidiary still aggregated to composite grain
      expect(sql).toContain('GROUP BY date, source, medium');
      // Outer aggregation lands after the final LEFT JOIN
      expect(sql.indexOf('LEFT JOIN events')).toBeLessThan(
        sql.indexOf('GROUP BY\n  main.date,\n  main.source,\n  main.medium')
      );
    });
  });

  // ── Full integration: all 4 assertions in one snapshot-style test ──────────

  it('full SQL contains every required composite-key fragment', () => {
    const { sql } = builder.buildBlendedQuery(makeAggCtx());

    // 1. Composite-key join (3-condition ON)
    expect(sql).toContain(
      'ON main.date = events.date AND main.source = events.source AND main.medium = events.medium'
    );
    // 2. Subsidiary GROUP BY full grain (no multiplication)
    expect(sql).toContain('GROUP BY date, source, medium');
    // 3a. Outer sessions aggregation
    expect(sql).toContain('SUM(main.sessions) AS `sessions | SUM`');
    // 3b. Outer events aggregation
    expect(sql).toContain('SUM(events.events__events) AS `events__events | SUM`');
    // 3c. Outer GROUP BY dimensions
    expect(sql).toContain('GROUP BY\n  main.date,\n  main.source,\n  main.medium');
    // 4. CTE scaffold
    expect(sql).toContain('events_raw AS (');
    expect(sql).toContain('events AS (');
    expect(sql).toContain('SUM(events) AS events__events');
  });
});
