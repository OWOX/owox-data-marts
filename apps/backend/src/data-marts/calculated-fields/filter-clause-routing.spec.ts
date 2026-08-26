import { routeFilterClauses } from './filter-clause-routing';
import { filterClauseOf, isHavingFilterRule, isWhereFilterRule } from '../dto/domain/filter-clause';
import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { FilterRule } from '../dto/schemas/filter-config.schema';
import type { RoutedDataMartQueryOptions } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import type { RoutedBlendedQueryContext } from '../data-storage-types/interfaces/blended-query-builder.interface';

const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
const SESSION_KEY_FORMULA = 'CONCAT({{ref field="user_id"}}, {{ref field="session_id"}})';

const field = (name: string, extra: Record<string, unknown> = {}): DataMartSchemaField =>
  ({ name, type: 'STRING', status: 'CONNECTED', ...extra }) as unknown as DataMartSchemaField;

const SCHEMA: DataMartSchemaField[] = [
  field('channel'),
  field('clicks', { type: 'INTEGER' }),
  field('impressions', { type: 'INTEGER' }),
  field('user_id'),
  field('session_id'),
  field('ctr', { type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } }),
  field('session_key', { calculated: { formula: SESSION_KEY_FORMULA, level: 'column' } }),
];

const clauseFor = (rule: FilterRule, schema = SCHEMA) =>
  routeFilterClauses([rule], schema)[0].clause;

describe('the one seat that decides a filter rule clause', () => {
  describe('routeFilterClauses stamps the verdict', () => {
    // The pre-existing rule, unchanged: an ordinary column filtered raw is a WHERE rule, and one
    // filtered through a report aggregation is a HAVING rule.
    it('routes an ordinary column with no function to WHERE', () => {
      expect(clauseFor({ column: 'channel', operator: 'eq', value: 'paid' })).toBe('where');
    });

    it('routes a rule carrying a function to HAVING', () => {
      expect(clauseFor({ column: 'clicks', function: 'SUM', operator: 'gt', value: 10 })).toBe(
        'having'
      );
    });

    // The case `rule.function` cannot express: the aggregation lives INSIDE the formula, so the
    // rule carries no function and never can (AGGREGATION_ON_CALCULATED_FIELD).
    it('routes a function-less rule on an AGGREGATE-level calculated field to HAVING', () => {
      expect(clauseFor({ column: 'ctr', operator: 'gt', value: 0.5 })).toBe('having');
    });

    it('routes a function-less rule on a ROW-LEVEL calculated field to WHERE', () => {
      expect(clauseFor({ column: 'session_key', operator: 'eq', value: 'a1' })).toBe('where');
    });

    // Through `calculatedFieldLevelOf`, never off the recorded `level` alone: that one is a cache,
    // so the formula text answers first and the recorded level only ever upgrades.
    it('derives the level through the level seat, formula text first', () => {
      const schema = [
        ...SCHEMA,
        field('ctr_unlabelled', { type: 'FLOAT', calculated: { formula: CTR_FORMULA } }),
        field('key_mislabelled', {
          calculated: { formula: SESSION_KEY_FORMULA, level: 'metric' },
        }),
      ];
      expect(clauseFor({ column: 'ctr_unlabelled', operator: 'gt', value: 1 }, schema)).toBe(
        'having'
      );
      expect(clauseFor({ column: 'key_mislabelled', operator: 'eq', value: 'a' }, schema)).toBe(
        'having'
      );
    });

    // A row-level field the REPORT aggregates carries a function, so the first half of the rule
    // already routes it.
    it('routes an aggregated ROW-LEVEL calculated field to HAVING through its function', () => {
      expect(
        clauseFor({ column: 'session_key', function: 'COUNT_DISTINCT', operator: 'gt', value: 2 })
      ).toBe('having');
    });

    it('stamps every rule and preserves order and the rest of the rule', () => {
      const routed = routeFilterClauses(
        [
          { column: 'channel', operator: 'eq', value: 'paid', placement: 'pre-join' },
          { column: 'ctr', operator: 'gt', value: 0.5 },
        ],
        SCHEMA
      );
      expect(routed).toEqual([
        {
          column: 'channel',
          operator: 'eq',
          value: 'paid',
          placement: 'pre-join',
          clause: 'where',
        },
        { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
      ]);
    });

    it('returns an empty list for no filters', () => {
      expect(routeFilterClauses(undefined, SCHEMA)).toEqual([]);
      expect(routeFilterClauses([], SCHEMA)).toEqual([]);
    });

    // Re-stamping is what happens on the Totals path (composeTotals routes, then compose routes
    // the plan it built), so the verdict must be recomputed rather than inherited or doubled.
    it('is idempotent', () => {
      const once = routeFilterClauses([{ column: 'ctr', operator: 'gt', value: 0.5 }], SCHEMA);
      expect(routeFilterClauses(once, SCHEMA)).toEqual(once);
    });
  });

  // The hole the runtime fallback deliberately does NOT close: a new producer forwarding
  // `report.filterConfig` straight into a builder. It is a `FilterRule[]`, so an optional stamp
  // would accept it and an aggregate-level Calculated Field's predicate would land in WHERE. Both
  // facades — the only way production code reaches a builder — require the verdict instead, and
  // `nest build` type-checks every producer against them.
  //
  // Executable documentation of that contract rather than a gate: ts-jest runs with
  // `diagnostics: false`, so nothing here can fail at test time. The enforcing check is the build.
  describe('the facade option types refuse an unrouted list', () => {
    it('rejects report.filterConfig forwarded as-is', () => {
      const unrouted: FilterRule[] = [{ column: 'channel', operator: 'eq', value: 'paid' }];
      const flat: Pick<RoutedDataMartQueryOptions, 'filters'> = {
        // @ts-expect-error the clause must be decided before a builder sees the rule
        filters: unrouted,
      };
      const blended: Pick<RoutedBlendedQueryContext, 'filters'> = {
        // @ts-expect-error the clause must be decided before a builder sees the rule
        filters: unrouted,
      };
      const routed: Pick<RoutedDataMartQueryOptions, 'filters'> = {
        filters: routeFilterClauses(unrouted, SCHEMA),
      };
      expect([flat, blended, routed]).toHaveLength(3);
    });
  });

  describe('filterClauseOf is the one reader', () => {
    it('reads the stamp when there is one', () => {
      const [routed] = routeFilterClauses([{ column: 'ctr', operator: 'gt', value: 0.5 }], SCHEMA);
      expect(filterClauseOf(routed)).toBe('having');
      expect(isHavingFilterRule(routed)).toBe(true);
      expect(isWhereFilterRule(routed)).toBe(false);
    });

    // Absent means "not routed", which is the truth for every rule built before this feature —
    // and for those `rule.function` IS the answer.
    it('falls back to rule.function for an unstamped rule', () => {
      expect(filterClauseOf({ column: 'a', operator: 'eq', value: 1 })).toBe('where');
      expect(filterClauseOf({ column: 'a', function: 'SUM', operator: 'eq', value: 1 })).toBe(
        'having'
      );
    });
  });
});
