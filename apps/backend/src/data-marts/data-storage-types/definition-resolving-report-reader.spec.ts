import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  DefinitionResolvingReportReader,
  DefinitionResolvingReportReaderResolver,
} from './definition-resolving-report-reader';
import { DataStorageType } from './enums/data-storage-type.enum';
import { DataStorageReportReader } from './interfaces/data-storage-report-reader.interface';

function innerReader(): jest.Mocked<DataStorageReportReader> {
  return {
    type: DataStorageType.GOOGLE_BIGQUERY,
    honorsQueryTimeout: true,
    prepareReportData: jest.fn().mockResolvedValue({ dataHeaders: [] }),
    readReportDataBatch: jest.fn().mockResolvedValue({ dataRows: [] }),
    finalize: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockReturnValue(null),
    initFromState: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DataStorageReportReader>;
}

describe('DefinitionResolvingReportReader', () => {
  const report = { dataMart: { id: 'dm-1' } } as never;
  const resolved = { dataMart: { id: 'dm-1', resolved: true } } as never;

  it('hands the reader a report whose definition is resolved', async () => {
    const inner = innerReader();
    const definitions = {
      resolveDefinition: jest.fn(),
      withResolvedDataMart: jest.fn().mockResolvedValue(resolved),
    };
    const reader = new DefinitionResolvingReportReader(inner, definitions);

    await reader.prepareReportData(report, { columnFilter: ['a'] });

    expect(definitions.withResolvedDataMart).toHaveBeenCalledWith(report);
    expect(inner.prepareReportData).toHaveBeenCalledWith(resolved, { columnFilter: ['a'] });
  });

  it('leaves the report alone when the reader runs an SQL override', async () => {
    const inner = innerReader();
    const definitions = { resolveDefinition: jest.fn(), withResolvedDataMart: jest.fn() };
    const reader = new DefinitionResolvingReportReader(inner, definitions);

    await reader.prepareReportData(report, { sqlOverride: 'SELECT 1' });

    expect(definitions.withResolvedDataMart).not.toHaveBeenCalled();
    expect(inner.prepareReportData).toHaveBeenCalledWith(report, { sqlOverride: 'SELECT 1' });
  });

  it('delegates everything else', async () => {
    const inner = innerReader();
    const reader = new DefinitionResolvingReportReader(inner, {
      resolveDefinition: jest.fn(),
      withResolvedDataMart: jest.fn(),
    });

    await reader.readReportDataBatch('batch', 10);
    await reader.finalize();
    reader.getState();
    await reader.initFromState({} as never, []);

    expect(reader.type).toBe(DataStorageType.GOOGLE_BIGQUERY);
    expect(reader.honorsQueryTimeout).toBe(true);
    expect(inner.readReportDataBatch).toHaveBeenCalledWith('batch', 10);
    expect(inner.finalize).toHaveBeenCalled();
    expect(inner.getState).toHaveBeenCalled();
    expect(inner.initFromState).toHaveBeenCalledWith({}, []);
  });
});

describe('DefinitionResolvingReportReaderResolver', () => {
  @Injectable()
  class SingletonReader {
    readonly type = DataStorageType.SNOWFLAKE;
  }

  it('wraps every reader it resolves', async () => {
    const inner = new SingletonReader() as unknown as DataStorageReportReader;
    const resolver = new DefinitionResolvingReportReaderResolver([inner], {} as ModuleRef, {
      resolveDefinition: jest.fn(),
      withResolvedDataMart: jest.fn(),
    });

    const reader = await resolver.resolve(DataStorageType.SNOWFLAKE);

    expect(reader).toBeInstanceOf(DefinitionResolvingReportReader);
    expect(reader.type).toBe(DataStorageType.SNOWFLAKE);
    expect(await resolver.tryResolve(DataStorageType.AWS_ATHENA)).toBeUndefined();
  });
});
