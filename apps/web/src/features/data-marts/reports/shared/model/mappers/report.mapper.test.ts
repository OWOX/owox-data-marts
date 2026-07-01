import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../data-destination/shared/model/mappers/data-destination.mapper', () => ({
  mapDataDestinationFromDto: vi.fn(() => ({
    id: 'dest-1',
    type: 'GOOGLE_SHEETS',
    title: 'Sheets',
  })),
}));

vi.mock('../../../../../data-storage/shared/model/mappers', () => ({
  mapDataStorageFromDto: vi.fn(() => ({ type: 'GOOGLE_BIGQUERY' })),
}));

vi.mock('./destination-config-mapper.factory.ts', () => ({
  DestinationConfigMapperFactory: {
    getMapper: vi.fn(() => ({
      mapFromDto: vi.fn(() => ({ type: 'GOOGLE_SHEETS_CONFIG', spreadsheetId: 's', sheetId: 0 })),
    })),
  },
}));

import { mapReportDtoToEntity } from './report.mapper';
import type { ReportResponseDto } from '../../services';
import { DestinationTypeConfigEnum } from '../../enums/destination-type-config.enum';

function buildMinimalDto(overrides: Partial<ReportResponseDto> = {}): ReportResponseDto {
  return {
    id: 'report-1',
    title: 'Test Report',
    dataMart: {
      id: 'dm-1',
      title: 'DM',
    } as ReportResponseDto['dataMart'],
    dataDestinationAccess: {
      id: 'dest-1',
    } as ReportResponseDto['dataDestinationAccess'],
    destinationConfig: {
      type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG,
      spreadsheetId: 'sheet-1',
      sheetId: 0,
    },
    columnConfig: null,
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    aggregationConfig: null,
    dateTruncConfig: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    runsCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    canRun: true,
    canManageTriggers: true,
    canEditConfig: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mapReportDtoToEntity — uniqueCountConfig', () => {
  it('maps true → true', () => {
    const entity = mapReportDtoToEntity(buildMinimalDto({ uniqueCountConfig: true }));
    expect(entity.uniqueCountConfig).toBe(true);
  });

  it('maps false → false', () => {
    const entity = mapReportDtoToEntity(buildMinimalDto({ uniqueCountConfig: false }));
    expect(entity.uniqueCountConfig).toBe(false);
  });

  it('maps null → false', () => {
    const entity = mapReportDtoToEntity(buildMinimalDto({ uniqueCountConfig: null }));
    expect(entity.uniqueCountConfig).toBe(false);
  });

  it('maps absent (undefined) → false', () => {
    const dto = buildMinimalDto();
    delete (dto as Partial<ReportResponseDto>).uniqueCountConfig;
    const entity = mapReportDtoToEntity(dto);
    expect(entity.uniqueCountConfig).toBe(false);
  });
});
