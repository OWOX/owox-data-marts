import { describe, expect, it } from 'vitest';
import { mapDataMartListFromDto } from './data-mart-list.mapper';
import type { DataMartListItemResponseDto } from '../../../shared';
import { DataMartStatus, DataMartDefinitionType } from '../../../shared';
import { DataStorageType } from '../../../../data-storage';

const baseDto = (
  overrides: Partial<DataMartListItemResponseDto> = {}
): DataMartListItemResponseDto => ({
  id: 'dm-1',
  title: 'Demo data mart',
  status: DataMartStatus.PUBLISHED,
  storage: { type: DataStorageType.GOOGLE_BIGQUERY, title: 'BQ Project' },
  definitionType: DataMartDefinitionType.SQL,
  connectorSourceName: null,
  triggersCount: 0,
  reportsCount: 0,
  createdByUser: null,
  businessOwnerUsers: [],
  technicalOwnerUsers: [],
  createdAt: new Date('2026-05-20T00:00:00.000Z'),
  modifiedAt: new Date('2026-05-20T00:00:00.000Z'),
  contexts: [],
  ...overrides,
});

describe('mapDataMartListFromDto', () => {
  it('preserves owner arrays and contexts when the API returns them', () => {
    const dto = baseDto({
      businessOwnerUsers: [{ userId: 'u-1', fullName: 'Biz Owner', email: null, avatar: null }],
      technicalOwnerUsers: [
        { userId: 'u-2', fullName: null, email: 'tech@example.com', avatar: null },
      ],
      contexts: [{ id: 'ctx-1', name: 'Marketing' }],
    });

    const [item] = mapDataMartListFromDto([dto]);

    expect(item.businessOwnerUsers).toEqual(dto.businessOwnerUsers);
    expect(item.technicalOwnerUsers).toEqual(dto.technicalOwnerUsers);
    expect(item.contexts).toEqual(dto.contexts);
  });

  // Regression: self-managed backends can omit these fields entirely.
  // Without normalization, downstream consumers call .map / for..of on undefined
  // and crash the data marts list page (see #1222-ish report).
  it('normalizes missing owner arrays and contexts to empty arrays', () => {
    const dto = baseDto();
    delete (dto as Partial<DataMartListItemResponseDto>).businessOwnerUsers;
    delete (dto as Partial<DataMartListItemResponseDto>).technicalOwnerUsers;
    delete (dto as Partial<DataMartListItemResponseDto>).contexts;

    const [item] = mapDataMartListFromDto([dto]);

    expect(item.businessOwnerUsers).toEqual([]);
    expect(item.technicalOwnerUsers).toEqual([]);
    expect(item.contexts).toEqual([]);
  });
});
