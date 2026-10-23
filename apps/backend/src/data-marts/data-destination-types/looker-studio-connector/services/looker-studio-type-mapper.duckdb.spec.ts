import { Test, TestingModule } from '@nestjs/testing';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';
import { LookerStudioAggregationMapperService } from './looker-studio-aggregation-mapper.service';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { DuckdbFieldType } from '../../../data-storage-types/duckdb/enums/duckdb-field-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';

describe('LookerStudioTypeMapperService — DuckDB', () => {
  let service: LookerStudioTypeMapperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LookerStudioTypeMapperService, LookerStudioAggregationMapperService],
    }).compile();

    service = module.get(LookerStudioTypeMapperService);
  });

  it.each([
    [DuckdbFieldType.BIGINT, FieldDataType.NUMBER],
    [DuckdbFieldType.DOUBLE, FieldDataType.NUMBER],
    [DuckdbFieldType.BOOLEAN, FieldDataType.BOOLEAN],
    [DuckdbFieldType.DATE, FieldDataType.STRING],
    [DuckdbFieldType.TIMESTAMP, FieldDataType.STRING],
    [DuckdbFieldType.TIMESTAMPTZ, FieldDataType.STRING],
    [DuckdbFieldType.TIME, FieldDataType.STRING],
    [DuckdbFieldType.VARCHAR, FieldDataType.STRING],
  ])('%s -> %s', (rawType, expected) => {
    expect(service.mapToLookerStudioDataType(rawType, DataStorageType.DUCKDB)).toBe(expected);
  });
});
