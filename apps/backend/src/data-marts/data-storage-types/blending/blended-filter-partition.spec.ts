import { partitionBlendedFilters } from './blended-filter-partition';
import { DataStorageType } from '../enums/data-storage-type.enum';
import type {
  BlendedFieldEntry,
  BlendedQueryContext,
} from '../interfaces/blended-query-builder.interface';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
import type { RoutedFilterRule } from '../../dto/domain/filter-clause';

const entry = (overrides: Partial<BlendedFieldEntry> = {}): BlendedFieldEntry =>
  ({
    aliasPath: 'users',
    cteName: 'users',
    originalFieldName: 'country',
    type: 'STRING',
    ...overrides,
  }) as BlendedFieldEntry;

const contextWith = (filters: FilterRule[]): BlendedQueryContext =>
  ({
    chains: [{ cteName: 'users' }],
    filters,
    fieldIndex: new Map([['users__country', entry()]]),
  }) as unknown as BlendedQueryContext;

describe('partitionBlendedFilters — pre/post-join split', () => {
  it('routes a post-join WHERE rule to the post-join set', () => {
    const { postJoinFilters, preJoinByCte } = partitionBlendedFilters(
      contextWith([{ column: 'users__country', operator: 'eq', value: 'US' }]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(postJoinFilters).toHaveLength(1);
    expect(preJoinByCte.size).toBe(0);
  });

  it('pushes a pre-join WHERE rule down to its own CTE under the raw column name', () => {
    const { preJoinByCte } = partitionBlendedFilters(
      contextWith([
        { column: 'users__country', operator: 'eq', value: 'US', placement: 'pre-join' },
      ]),
      DataStorageType.GOOGLE_BIGQUERY
    );
    expect(preJoinByCte.get('users')).toEqual([
      expect.objectContaining({ column: 'country', placement: 'pre-join' }),
    ]);
  });

  // A pre-join HAVING has nowhere to run: the raw CTE renders WHERE only, and HAVING exists
  // post-join. A function-less rule routed to HAVING must trip the same invariant,
  // or an aggregate-level Calculated Field's predicate is silently pushed into a raw CTE that
  // drops it, and the report returns more rows than asked for.
  it('throws for a pre-join rule carrying a function', () => {
    expect(() =>
      partitionBlendedFilters(
        contextWith([
          {
            column: 'users__country',
            function: 'COUNT',
            operator: 'gt',
            value: 1,
            placement: 'pre-join',
          },
        ]),
        DataStorageType.GOOGLE_BIGQUERY
      )
    ).toThrow(/cannot be pushed pre-join/);
  });

  it('throws for a function-less pre-join rule routed to HAVING', () => {
    const filters: RoutedFilterRule[] = [
      {
        column: 'users__country',
        operator: 'gt',
        value: 0.5,
        placement: 'pre-join',
        clause: 'having',
      },
    ];
    expect(() =>
      partitionBlendedFilters(contextWith(filters), DataStorageType.GOOGLE_BIGQUERY)
    ).toThrow(/cannot be pushed pre-join/);
  });

  // The blended half of the one type seat. `columnTypes.postJoin` is built from the
  // blended field index, which holds warehouse columns only, so a Calculated Field could never
  // appear there: the resolver answered `undefined` for it and the VALUE's JS type decided the
  // comparison. Both plan lists are read, since a filter may name a field the report also selects.
  describe('the declared type of a Calculated Field', () => {
    const ctr = {
      outputName: 'ctr',
      type: 'FLOAT',
      formula: 'SUM({{ref field="clicks"}})',
      level: 'metric' as const,
    };
    const contextWithCalculated = (
      key: 'calculatedFields' | 'calculatedFilterMetrics'
    ): BlendedQueryContext =>
      ({
        chains: [{ cteName: 'users' }],
        filters: [],
        fieldIndex: new Map([['users__country', entry()]]),
        columnTypes: { postJoin: new Map([['users__country', 'STRING']]) },
        [key]: [ctr],
      }) as unknown as BlendedQueryContext;

    it('answers a filtered calculated field its declaration, from either plan list', () => {
      for (const key of ['calculatedFields', 'calculatedFilterMetrics'] as const) {
        const { resolveColumnType } = partitionBlendedFilters(
          contextWithCalculated(key),
          DataStorageType.GOOGLE_BIGQUERY
        );
        expect(`${key}: ${resolveColumnType({ column: 'ctr', operator: 'gt', value: 0.5 })}`).toBe(
          `${key}: FLOAT`
        );
      }
    });

    it('still answers an ordinary post-join column from the type map', () => {
      const { resolveColumnType } = partitionBlendedFilters(
        contextWithCalculated('calculatedFilterMetrics'),
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(resolveColumnType({ column: 'users__country', operator: 'eq', value: 'US' })).toBe(
        'STRING'
      );
    });
  });
});
