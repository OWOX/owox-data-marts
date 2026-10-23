import { describe, expect, it } from 'vitest';
import { mapDataMartFromDto } from './data-mart.mapper';
import { DataMartStatus } from '../../../shared/enums';
import type { DataMartResponseDto } from '../../../shared/types/api/response/data-mart.response.dto';
import { DataStorageType } from '../../../../data-storage/shared/model/types';

const response: DataMartResponseDto = {
  id: 'mart',
  title: 'Revenue',
  status: DataMartStatus.DRAFT,
  description: null,
  definitionType: null,
  definition: null,
  schema: null,
  storage: {
    id: 'storage',
    title: 'Warehouse',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: null,
    credentials: null,
    publishedDataMartsCount: 0,
    draftDataMartsCount: 1,
    createdAt: '2026-10-22T00:00:00.000Z',
    modifiedAt: '2026-10-22T00:00:00.000Z',
  },
  triggersCount: 0,
  reportsCount: 0,
  createdByUser: null,
  businessOwnerUsers: [],
  technicalOwnerUsers: [],
  createdAt: new Date('2026-10-22T00:00:00.000Z'),
  modifiedAt: new Date('2026-10-22T00:00:00.000Z'),
};

describe('mapDataMartFromDto nullable metadata', () => {
  it.each([{}, { icon: null, blendedFieldsConfig: null }])(
    'maps cleared descriptions and absent optional configuration into safe UI values: %j',
    async optionalFields => {
      const model = await mapDataMartFromDto({ ...response, ...optionalFields });
      expect(model).toMatchObject({ description: null, icon: null, blendedFieldsConfig: null });
    }
  );
});
