import { mapMcpFiltersToRules } from '../../ee/mcp/tools/query-data-mart.input';
import type { FilterRule } from '../dto/schemas/filter-config.schema';
import {
  sameFieldSelection,
  toMcpFields,
  toMcpFilter,
  toMcpFilterGroups,
  toMcpOutputControls,
} from './mcp-report-output-controls';

describe('mcp-report-output-controls', () => {
  describe('toMcpFields / sameFieldSelection', () => {
    it("spells an absent projection as ['*'] and keeps an explicit empty one", () => {
      expect(toMcpFields(undefined)).toEqual(['*']);
      expect(toMcpFields(null)).toEqual(['*']);
      // A metrics-only Unique Count report projects no dimension column.
      expect(toMcpFields([])).toEqual([]);
      expect(toMcpFields(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('treats the same set of fields in any order as the same selection', () => {
      expect(sameFieldSelection(['revenue', 'channel'], ['channel', 'revenue'])).toBe(true);
      expect(sameFieldSelection(['channel'], ['channel', 'revenue'])).toBe(false);
      expect(sameFieldSelection(['channel', 'revenue'], ['channel'])).toBe(false);
      expect(sameFieldSelection(['channel', 'channel'], ['channel', 'revenue'])).toBe(false);
    });

    it("treats null and ['*'] as the same all-fields selection", () => {
      expect(sameFieldSelection(null, null)).toBe(true);
      expect(sameFieldSelection(undefined, null)).toBe(true);
      expect(sameFieldSelection(null, ['channel'])).toBe(false);
    });

    it('does not confuse a metrics-only (empty) projection with all fields', () => {
      expect(sameFieldSelection([], null)).toBe(false);
      expect(sameFieldSelection(null, [])).toBe(false);
      expect(sameFieldSelection([], [])).toBe(true);
    });
  });

  describe('toMcpFilter', () => {
    // The MCP→domain mapper translates these on the way in; a stored rule created
    // over MCP must come back as exactly what the agent sent.
    it.each([
      [{ field: 'active', operator: 'eq', value: true }],
      [{ field: 'active', operator: 'eq', value: false }],
      [{ field: 'channel', operator: 'eq', value: 'ads' }],
      [{ field: 'channel', operator: 'in', value: ['ads', 'seo'] }],
      [{ field: 'revenue', operator: 'between', value: { from: 1, to: 10 } }],
      [{ field: 'country', operator: 'is_blank' }],
      [{ field: 'date', operator: 'in_last_n_days', value: 7 }],
      [{ field: 'date', operator: 'in_next_n_days', value: 3 }],
      [{ field: 'date', operator: 'this_week' }],
      [{ field: 'date', operator: 'last_quarter' }],
      [{ field: 'date', operator: 'this_year' }],
    ])('round-trips %j through the domain vocabulary', mcpFilter => {
      const [rule] = mapMcpFiltersToRules([], [mcpFilter]) ?? [];

      expect(toMcpFilter(rule)).toEqual(mcpFilter);
    });

    it('spells neq on a boolean back as eq with the opposite value', () => {
      const [rule] =
        mapMcpFiltersToRules([], [{ field: 'active', operator: 'neq', value: true }]) ?? [];

      expect(toMcpFilter(rule)).toEqual({ field: 'active', operator: 'eq', value: false });
    });

    it('returns a UI-only preset as stored instead of inventing an MCP operator', () => {
      const rule: FilterRule = {
        column: 'date',
        operator: 'relative_date',
        value: { kind: 'last_n_months', n: 2 },
      };

      expect(toMcpFilter(rule)).toEqual({
        field: 'date',
        operator: 'relative_date',
        value: { kind: 'last_n_months', n: 2 },
      });
      expect(toMcpFilter({ column: 'name', operator: 'regex', value: '^a' })).toEqual({
        field: 'name',
        operator: 'regex',
        value: '^a',
      });
    });
  });

  describe('toMcpFilterGroups', () => {
    it('splits rules by placement and keeps HAVING rules apart', () => {
      const groups = toMcpFilterGroups([
        { column: 'source', operator: 'eq', value: 'ga4', placement: 'pre-join' },
        { column: 'channel', operator: 'eq', value: 'ads', placement: 'post-join' },
        // No placement — created in the UI — counts as post-join.
        { column: 'country', operator: 'is_not_blank' },
        { column: 'revenue', operator: 'gt', value: 100, function: 'SUM' },
      ]);

      expect(groups).toEqual({
        slices: [{ field: 'source', operator: 'eq', value: 'ga4' }],
        filters: [
          { field: 'channel', operator: 'eq', value: 'ads' },
          { field: 'country', operator: 'is_not_blank' },
        ],
        post_aggregation_filters: [
          { field: 'revenue', operator: 'gt', value: 100, function: 'SUM' },
        ],
      });
    });

    it('omits post_aggregation_filters when there are none', () => {
      expect(toMcpFilterGroups(null)).toEqual({ filters: [], slices: [] });
      expect(toMcpFilterGroups(undefined)).not.toHaveProperty('post_aggregation_filters');
    });
  });

  describe('toMcpOutputControls', () => {
    it('maps every stored control into the report-tool vocabulary', () => {
      expect(
        toMcpOutputControls({
          columnConfig: ['date', 'revenue'],
          filterConfig: [{ column: 'channel', operator: 'eq', value: 'ads' }],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          dateTruncConfig: [{ column: 'date', unit: 'MONTH', timeZone: 'Europe/Kyiv' }],
          sortConfig: [{ column: 'revenue', direction: 'desc' }],
          limitConfig: 500,
        })
      ).toEqual({
        fields: ['date', 'revenue'],
        unique_count_sources: [],
        filters: [{ field: 'channel', operator: 'eq', value: 'ads' }],
        slices: [],
        aggregations: [{ field: 'revenue', function: 'SUM' }],
        date_buckets: [{ field: 'date', unit: 'MONTH', time_zone: 'Europe/Kyiv' }],
        sort: [{ field: 'revenue', direction: 'desc' }],
        limit: 500,
      });
    });

    it('describes a metrics-only Unique Count report as projecting nothing but its metrics', () => {
      expect(toMcpOutputControls({ columnConfig: [], uniqueCountConfig: ['orders', ''] })).toEqual(
        expect.objectContaining({
          fields: [],
          unique_count_sources: ['orders__unique_count', 'unique_count'],
        })
      );
      // Legacy boolean shape = the main data mart only.
      expect(toMcpOutputControls({ uniqueCountConfig: true }).unique_count_sources).toEqual([
        'unique_count',
      ]);
    });

    it('spells an unconfigured report as all fields, no controls, no cap', () => {
      expect(toMcpOutputControls({})).toEqual({
        fields: ['*'],
        unique_count_sources: [],
        filters: [],
        slices: [],
        aggregations: [],
        date_buckets: [],
        sort: [],
        limit: null,
      });
    });
  });
});
