import { describe, expect, it } from 'vitest';
import { applyFiltersToData } from '../../../../../../shared/components/TableFilters/filter-utils';
import type { FiltersState } from '../../../../../../shared/components/TableFilters/types';
import type { DataMartListItem } from '../../../model/types';
import { DataMartColumnKey } from '../columns/columnKeys';
import {
  AdditionalFilterKeys,
  buildDataMartsTableFilters,
  dataMartsFilterAccessors,
  NO_CONTEXT_FILTER_VALUE,
  RELATIONSHIPS_FILTER_VALUE,
  type DataMartFilterKey,
} from './DataMartsTableFilters.config';

const dataMart = (
  id: string,
  relationshipsCount: number,
  contexts: DataMartListItem['contexts'] = []
): DataMartListItem =>
  ({
    id,
    title: id,
    status: { code: 'PUBLISHED' },
    storageType: 'GOOGLE_BIGQUERY',
    definitionType: 'SQL',
    connectorSourceName: null,
    createdByUser: null,
    relationshipsCount,
    contexts,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
  }) as unknown as DataMartListItem;

const marketing = { id: 'ctx-marketing', name: 'Marketing' };

const data = [
  dataMart('joined-no-context', 2),
  dataMart('joined-marketing', 1, [marketing]),
  dataMart('alone-no-context', 0),
  dataMart('alone-marketing', 0, [marketing]),
];

const filterIds = (filters: FiltersState<DataMartFilterKey>['filters']) =>
  applyFiltersToData(data, { version: 1, filters }, dataMartsFilterAccessors).map(item => item.id);

describe('Data Marts list filters', () => {
  it('offers With and Without relationships', () => {
    const relationships = buildDataMartsTableFilters(data).find(
      f => f.id === AdditionalFilterKeys.RELATIONSHIPS
    );

    expect(relationships?.label).toBe('Relationships');
    expect(relationships?.options).toEqual([
      { value: RELATIONSHIPS_FILTER_VALUE.WITH, label: 'With relationships' },
      { value: RELATIONSHIPS_FILTER_VALUE.WITHOUT, label: 'Without relationships' },
    ]);
  });

  it('offers No context first, then the contexts in use', () => {
    const contexts = buildDataMartsTableFilters(data).find(
      f => f.id === DataMartColumnKey.CONTEXTS
    );

    expect(contexts?.options).toEqual([
      { value: NO_CONTEXT_FILTER_VALUE, label: 'No context' },
      { value: marketing.id, label: marketing.name },
    ]);
  });

  it('finds Data Marts with relationships that are in no context', () => {
    expect(
      filterIds([
        {
          fieldId: AdditionalFilterKeys.RELATIONSHIPS,
          operator: 'eq',
          value: [RELATIONSHIPS_FILTER_VALUE.WITH],
        },
        { fieldId: DataMartColumnKey.CONTEXTS, operator: 'eq', value: [NO_CONTEXT_FILTER_VALUE] },
      ])
    ).toEqual(['joined-no-context']);
  });

  it('combines No context with real contexts and supports is none of', () => {
    expect(
      filterIds([
        {
          fieldId: DataMartColumnKey.CONTEXTS,
          operator: 'eq',
          value: [NO_CONTEXT_FILTER_VALUE, marketing.id],
        },
      ])
    ).toEqual(data.map(item => item.id));
    expect(
      filterIds([
        { fieldId: DataMartColumnKey.CONTEXTS, operator: 'neq', value: [NO_CONTEXT_FILTER_VALUE] },
      ])
    ).toEqual(['joined-marketing', 'alone-marketing']);
    expect(
      filterIds([
        {
          fieldId: AdditionalFilterKeys.RELATIONSHIPS,
          operator: 'neq',
          value: [RELATIONSHIPS_FILTER_VALUE.WITH],
        },
      ])
    ).toEqual(['alone-no-context', 'alone-marketing']);
  });
});
