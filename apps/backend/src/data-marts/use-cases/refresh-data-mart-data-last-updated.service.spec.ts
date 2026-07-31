import { RefreshDataMartDataLastUpdatedCommand } from '../dto/domain/refresh-data-mart-data-last-updated.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { RefreshDataMartDataLastUpdatedService } from './refresh-data-mart-data-last-updated.service';

const measured = {
  dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
  computedAt: '2026-07-28T00:00:00.000Z',
  coverage: 'complete' as const,
  sources: [{ table: 'my-project.ds.orders', dataLastUpdatedAt: '2026-07-25T08:30:00.000Z' }],
};

const storageA = { id: 'storage-1', type: 'GOOGLE_BIGQUERY' };
const storageB = { id: 'storage-2', type: 'GOOGLE_BIGQUERY' };

const mart = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  definitionType: DataMartDefinitionType.TABLE,
  definition: { fullyQualifiedName: `my-project.ds.${id}` },
  storage: storageA,
  ...overrides,
});

const command = (...ids: string[]) =>
  new RefreshDataMartDataLastUpdatedCommand(ids, 'p1', 'u1', ['viewer']);

describe('RefreshDataMartDataLastUpdatedService', () => {
  const createService = (overrides: {
    dataMarts?: Record<string, unknown>[];
    access?: Map<string, boolean>;
    buildQuery?: jest.Mock;
    resolveForSqlBatch?: jest.Mock;
  }) => {
    const dataMarts = overrides.dataMarts ?? [mart('dm1')];
    const dataMartService = {
      findByIdsAndProjectIdForSourceLookup: jest.fn().mockResolvedValue(dataMarts),
      updateDataLastUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccessMany: jest
        .fn()
        .mockResolvedValue(
          overrides.access ??
            new Map<string, boolean>(
              dataMarts.map((dm): [string, boolean] => [dm.id as string, true])
            )
        ),
    };
    const queryBuilderFacade = {
      buildQuery:
        overrides.buildQuery ?? jest.fn().mockResolvedValue({ sql: 'SELECT * FROM t', params: [] }),
    };
    const sourceDataLastUpdatedService = {
      resolveForSqlBatch:
        overrides.resolveForSqlBatch ??
        jest.fn(
          async (input: { items: { key: string }[] }) =>
            new Map(input.items.map(item => [item.key, measured]))
        ),
    };
    const service = new RefreshDataMartDataLastUpdatedService(
      dataMartService as never,
      accessDecisionService as never,
      queryBuilderFacade as never,
      sourceDataLastUpdatedService as never
    );
    return {
      service,
      dataMartService,
      accessDecisionService,
      queryBuilderFacade,
      sourceDataLastUpdatedService,
    };
  };

  it('builds SQL from each definition, resolves, persists, and returns the blocks', async () => {
    const { service, dataMartService, queryBuilderFacade, sourceDataLastUpdatedService } =
      createService({});

    const results = await service.run(command('dm1'));

    expect(results.get('dm1')).toEqual(measured);
    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith('GOOGLE_BIGQUERY', {
      fullyQualifiedName: 'my-project.ds.dm1',
    });
    expect(sourceDataLastUpdatedService.resolveForSqlBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: storageA,
        items: [{ key: 'dm1', sql: 'SELECT * FROM t', params: [] }],
      })
    );
    expect(dataMartService.updateDataLastUpdated).toHaveBeenCalledWith('dm1', measured);
  });

  it('measures all Data Marts on one storage in a single batch', async () => {
    const { service, sourceDataLastUpdatedService } = createService({
      dataMarts: [mart('dm1'), mart('dm2'), mart('dm3')],
    });

    await service.run(command('dm1', 'dm2', 'dm3'));

    // The whole point of the batch shape: one warehouse client for the sweep, not three.
    expect(sourceDataLastUpdatedService.resolveForSqlBatch).toHaveBeenCalledTimes(1);
    expect(sourceDataLastUpdatedService.resolveForSqlBatch.mock.calls[0][0].items).toHaveLength(3);
  });

  it('splits into one batch per storage', async () => {
    const { service, sourceDataLastUpdatedService } = createService({
      dataMarts: [mart('dm1'), mart('dm2', { storage: storageB })],
    });

    await service.run(command('dm1', 'dm2'));

    expect(sourceDataLastUpdatedService.resolveForSqlBatch).toHaveBeenCalledTimes(2);
    const storages = sourceDataLastUpdatedService.resolveForSqlBatch.mock.calls.map(
      ([input]: [{ storage: { id: string } }]) => input.storage.id
    );
    expect(storages.sort()).toEqual(['storage-1', 'storage-2']);
  });

  it('silently omits Data Marts the caller cannot see', async () => {
    const { service, sourceDataLastUpdatedService, dataMartService } = createService({
      dataMarts: [mart('dm1'), mart('dm2')],
      access: new Map([
        ['dm1', true],
        ['dm2', false],
      ]),
    });

    const results = await service.run(command('dm1', 'dm2'));

    expect(results.has('dm2')).toBe(false);
    expect(dataMartService.updateDataLastUpdated).not.toHaveBeenCalledWith('dm2', measured);
    expect(sourceDataLastUpdatedService.resolveForSqlBatch.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ key: 'dm1' }),
    ]);
  });

  it('skips a definition-less draft without touching the warehouse', async () => {
    const { service, sourceDataLastUpdatedService } = createService({
      dataMarts: [mart('dm1', { definitionType: null, definition: null })],
    });

    const results = await service.run(command('dm1'));

    expect(results.size).toBe(0);
    expect(sourceDataLastUpdatedService.resolveForSqlBatch).not.toHaveBeenCalled();
  });

  it('drops an unbuildable definition from the batch instead of failing the sweep', async () => {
    const buildQuery = jest.fn(
      async (_type: string, definition: { fullyQualifiedName: string }) => {
        if (definition.fullyQualifiedName.endsWith('dm1')) throw new Error('broken definition');
        return { sql: 'SELECT * FROM ok', params: [] };
      }
    );
    const { service, sourceDataLastUpdatedService } = createService({
      dataMarts: [mart('dm1'), mart('dm2')],
      buildQuery,
    });

    const results = await service.run(command('dm1', 'dm2'));

    expect(results.has('dm1')).toBe(false);
    expect(results.get('dm2')).toEqual(measured);
    expect(sourceDataLastUpdatedService.resolveForSqlBatch.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ key: 'dm2' }),
    ]);
  });

  it('keeps the persisted value when a lookup resolves nothing', async () => {
    const unresolved = { ...measured, dataLastUpdatedAt: null, coverage: 'unavailable' as const };
    const { service, dataMartService } = createService({
      resolveForSqlBatch: jest.fn().mockResolvedValue(new Map([['dm1', unresolved]])),
    });

    const results = await service.run(command('dm1'));

    expect(results.get('dm1')).toEqual(unresolved);
    // A failed lookup must not erase the last-known answer.
    expect(dataMartService.updateDataLastUpdated).not.toHaveBeenCalled();
  });

  it('returns nothing for keys the resolver left out, without clearing them', async () => {
    const { service, dataMartService } = createService({
      dataMarts: [mart('dm1'), mart('dm2')],
      // A timed-out sweep resolves only part of the batch.
      resolveForSqlBatch: jest.fn().mockResolvedValue(new Map([['dm1', measured]])),
    });

    const results = await service.run(command('dm1', 'dm2'));

    expect(results.has('dm2')).toBe(false);
    expect(dataMartService.updateDataLastUpdated).toHaveBeenCalledTimes(1);
    expect(dataMartService.updateDataLastUpdated).toHaveBeenCalledWith('dm1', measured);
  });

  it('returns the fresh value even when persisting it fails', async () => {
    const { service, dataMartService } = createService({});
    dataMartService.updateDataLastUpdated.mockRejectedValue(new Error('db down'));

    const results = await service.run(command('dm1'));

    expect(results.get('dm1')).toEqual(measured);
  });

  it('does no work for an empty id list', async () => {
    const { service, dataMartService } = createService({});

    const results = await service.run(command());

    expect(results.size).toBe(0);
    expect(dataMartService.findByIdsAndProjectIdForSourceLookup).not.toHaveBeenCalled();
  });
});
