import { DataMartService } from './data-mart.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { DataMart } from '../entities/data-mart.entity';

function makeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    schema: null,
    schemaActualizedAt: undefined,
    ...overrides,
  } as unknown as DataMart;
}

describe('DataMartService schema actualization', () => {
  let repository: { findOne: jest.Mock; save: jest.Mock };
  let schemaProvider: { getActualDataMartSchema: jest.Mock };
  let schemaMerger: { mergeSchemas: jest.Mock };
  let searchIndexInvalidation: { scheduleDataMartSchemaChanged: jest.Mock };
  let service: DataMartService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn(async (dataMart: DataMart) => dataMart),
    };
    schemaProvider = {
      getActualDataMartSchema: jest.fn().mockResolvedValue({ fields: [{ name: 'amount' }] }),
    };
    schemaMerger = {
      mergeSchemas: jest.fn().mockResolvedValue({ fields: [{ name: 'amount' }] }),
    };
    searchIndexInvalidation = {
      scheduleDataMartSchemaChanged: jest.fn().mockResolvedValue(undefined),
    };
    service = new DataMartService(
      repository as any,
      schemaProvider as any,
      schemaMerger as any,
      searchIndexInvalidation as any
    );
  });

  it('schedules search invalidation after saving an actualized schema', async () => {
    const dataMart = makeDataMart();
    repository.findOne.mockResolvedValue(dataMart);

    await service.actualizeSchema('dm-1', 'proj-1');

    expect(schemaProvider.getActualDataMartSchema).toHaveBeenCalledWith(dataMart);
    expect(schemaMerger.mergeSchemas).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY, null, {
      fields: [{ name: 'amount' }],
    });
    expect(repository.save).toHaveBeenCalledWith(dataMart);
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).toHaveBeenCalledWith(
      'dm-1',
      'proj-1'
    );
  });

  it('does not save or invalidate when schema is still fresh', async () => {
    const dataMart = makeDataMart({ schemaActualizedAt: new Date() });
    repository.findOne.mockResolvedValue(dataMart);

    await service.actualizeSchemaIfExpired('dm-1', 'proj-1', 60_000);

    expect(schemaProvider.getActualDataMartSchema).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).not.toHaveBeenCalled();
  });

  it('does not fail schema actualization when search invalidation fails', async () => {
    const dataMart = makeDataMart();
    repository.findOne.mockResolvedValue(dataMart);
    searchIndexInvalidation.scheduleDataMartSchemaChanged.mockRejectedValue(
      new Error('queue down')
    );
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(service.actualizeSchema('dm-1', 'proj-1')).resolves.toBe(dataMart);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('queue down'));
    warnSpy.mockRestore();
  });
});
