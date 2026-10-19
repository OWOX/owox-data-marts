jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { RunKind } from '../services/project-billing/project-billing.service';
import {
  PreviewAbortedError,
  PreviewDataMartCommand,
  PreviewDataMartService,
  toPreviewCell,
} from './preview-data-mart.service';

describe('PreviewDataMartService', () => {
  const dataMart = {
    id: 'dm1',
    projectId: 'p1',
    status: DataMartStatus.DRAFT,
    modifiedAt: new Date('2026-10-19T09:00:00Z'),
    definitionType: DataMartDefinitionType.TABLE,
    definition: { fullyQualifiedName: 'project.dataset.table' },
    revision: 3,
    schemaInputRevision: 2,
    schemaActualizedAt: new Date('2026-10-19T08:00:00Z'),
    schema: { type: 'bigquery-data-mart-schema', fields: [] },
    storage: { id: 'storage-1', projectId: 'p1', type: DataStorageType.GOOGLE_BIGQUERY },
  };

  const command = (overrides: { limit?: number; filters?: unknown; sort?: unknown } = {}) =>
    new PreviewDataMartCommand(
      'dm1',
      'p1',
      'user-1',
      [],
      'limit' in overrides ? overrides.limit : undefined,
      overrides.filters,
      overrides.sort
    );

  const createService = (
    overrides: {
      batches?: ReportDataBatch[];
      accessAllowed?: boolean;
      nativeFields?: { name: string; type: string; fields?: unknown[]; status?: string }[];
      readerError?: Error;
      composeError?: Error;
      blocked?: boolean;
      deadlineMs?: number;
      readerNeverResolves?: boolean;
    } = {}
  ) => {
    const batches = overrides.batches ?? [
      new ReportDataBatch(
        [
          ['fb', 10],
          ['org', 8],
        ],
        null
      ),
    ];

    const dataMartService = { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) };
    const blendableSchemaService = {
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields: overrides.nativeFields ?? [
          { name: 'channel', type: 'STRING' },
          { name: 'revenue', type: 'INTEGER' },
        ],
        blendedFields: [],
        availableSources: [],
      }),
    };
    const composer = {
      compose: overrides.composeError
        ? jest.fn().mockRejectedValue(overrides.composeError)
        : jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
    };
    const reader = {
      prepareReportData: jest
        .fn()
        .mockImplementation(() =>
          overrides.readerError
            ? Promise.reject(overrides.readerError)
            : overrides.readerNeverResolves
              ? new Promise(() => undefined)
              : Promise.resolve(
                  new ReportDataDescription([
                    new ReportDataHeader('channel', 'Channel', undefined, 'STRING' as never),
                    new ReportDataHeader('revenue', undefined, undefined, 'INTEGER' as never),
                  ])
                )
        ),
      readReportDataBatch: jest.fn(),
      finalize: jest.fn().mockResolvedValue(undefined),
    };
    let call = 0;
    reader.readReportDataBatch.mockImplementation(() =>
      Promise.resolve(batches[call++] ?? new ReportDataBatch([], null))
    );
    const readerResolver = { resolve: jest.fn().mockResolvedValue(reader) };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(overrides.accessAllowed ?? true),
      canAccessStored: jest.fn().mockResolvedValue(overrides.accessAllowed ?? true),
    };
    // Stands in for the storage error mapper: a provider error becomes a 424 carrying its message.
    const errorMapper = {
      toStorageReadError: jest.fn(
        (error: unknown) =>
          new HttpException(
            { message: `Storage failed: ${(error as Error).message}` },
            HttpStatus.FAILED_DEPENDENCY
          )
      ),
    };
    const errorMapperResolver = { resolve: jest.fn().mockResolvedValue(errorMapper) };
    const projectBilling = {
      verifyCanPerformOperations: overrides.blocked
        ? jest
            .fn()
            .mockRejectedValue(
              new ProjectOperationBlockedException([ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED])
            )
        : jest.fn().mockResolvedValue(undefined),
    };

    const service = new PreviewDataMartService(
      dataMartService as never,
      blendableSchemaService as never,
      composer as never,
      readerResolver as never,
      accessDecisionService as never,
      errorMapperResolver as never,
      projectBilling as never,
      overrides.deadlineMs ?? 3_600_000
    );
    return {
      service,
      composer,
      reader,
      readerResolver,
      errorMapper,
      projectBilling,
      dataMartService,
      accessDecisionService,
      blendableSchemaService,
    };
  };

  it('Setup preview uses stored action checks and records an observation with its starting configuration revision', async () => {
    const { service, accessDecisionService, blendableSchemaService } = createService();
    const result = await service.runForSetup(command());
    expect(result.observedModifiedAt).toBe('2026-10-19T09:00:00.000Z');
    expect(result.currentness).toBe('not-guaranteed');
    expect(result.preview.rowCount).toBe(2);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccessStored).toHaveBeenCalledWith(
      'user-1',
      [],
      'STORAGE',
      'storage-1',
      'USE',
      'p1'
    );
    expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
      'dm1',
      'p1',
      expect.objectContaining({ scopeMode: 'read-only' })
    );
  });

  it.each([null, 1])(
    'Setup preview rejects missing/stale schema binding %s before warehouse work',
    async schemaInputRevision => {
      const { service, dataMartService, composer, reader, blendableSchemaService } =
        createService();
      dataMartService.getByIdAndProjectId.mockResolvedValue({
        ...dataMart,
        revision: 4,
        schemaInputRevision,
      });
      await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 409 });
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      expect(composer.compose).not.toHaveBeenCalled();
      expect(reader.prepareReportData).not.toHaveBeenCalled();
    }
  );

  it('REST preview retains its existing behavior for an unbound schema', async () => {
    const { service, dataMartService, reader } = createService();
    dataMartService.getByIdAndProjectId.mockResolvedValue({
      ...dataMart,
      revision: 4,
      schemaInputRevision: null,
    });
    await expect(service.run(command())).resolves.toMatchObject({ rowCount: 2 });
    expect(reader.prepareReportData).toHaveBeenCalledTimes(1);
  });

  it('Setup preview refuses a storage USE denial before composing or reading', async () => {
    const { service, accessDecisionService, composer } = createService();
    accessDecisionService.canAccessStored.mockImplementation(
      async (_user, _roles, type) => type !== 'STORAGE'
    );
    await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 403 });
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('Setup preview rejects a concurrent definition change before returning obsolete rows', async () => {
    const { service, dataMartService } = createService();
    dataMartService.getByIdAndProjectId.mockResolvedValueOnce(dataMart).mockResolvedValue({
      ...dataMart,
      definition: { fullyQualifiedName: 'other.output' },
      revision: dataMart.revision + 1,
    });
    await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 409 });
  });

  it('Setup preview rechecks action authority before returning warehouse rows', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccessStored
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 403 });
  });

  it.each([DataMartStatus.DRAFT, DataMartStatus.PUBLISHED])(
    'Setup preview reads saved %s connector output without changing its definition',
    async status => {
      const { service, dataMartService, composer } = createService();
      const saved = {
        ...dataMart,
        status,
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: {
          connector: {
            source: { configuration: [{ token: 'private' }] },
            storage: { fullyQualifiedName: 'project.dataset.loaded_output' },
          },
        },
      };
      dataMartService.getByIdAndProjectId.mockResolvedValue(saved as never);
      await expect(service.runForSetup(command())).resolves.toMatchObject({
        observedStatus: status,
        observedDefinitionType: DataMartDefinitionType.CONNECTOR,
        preview: { rowCount: 2 },
      });
      expect(composer.compose.mock.calls[0][0].dataMart.definition).toEqual(saved.definition);
    }
  );

  it('Setup preview rejects an unavailable schema instead of returning empty success', async () => {
    const { service, composer } = createService({ nativeFields: [] });
    await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 400 });
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('Setup preview enforces the real project license gate without reading', async () => {
    const { service, composer, reader } = createService({ blocked: true });
    await expect(service.runForSetup(command())).rejects.toMatchObject({ status: 403 });
    expect(composer.compose).not.toHaveBeenCalled();
    expect(reader.prepareReportData).not.toHaveBeenCalled();
  });

  it('Setup preview keeps cancellation and timeout semantics', async () => {
    const { service, reader } = createService({ readerNeverResolves: true, deadlineMs: 5 });
    await expect(service.runForSetup(command())).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(reader.prepareReportData.mock.calls[0][1].signal.aborted).toBe(true);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(service.runForSetup(command(), cancelled.signal)).rejects.toBeInstanceOf(
      PreviewAbortedError
    );
  });

  it.each(['readerError', 'composeError'] as const)(
    'Setup preview never returns or logs %s diagnostic bodies',
    async key => {
      const { service } = createService({ [key]: new Error('credential=secret-provider-payload') });
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      const failure = service.runForSetup(command());
      await expect(failure).rejects.toMatchObject({ status: 424 });
      await expect(failure).rejects.not.toThrow('secret-provider-payload');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-provider-payload');
      warn.mockRestore();
    }
  );

  it('reads the default 10 rows (+1 to detect more) from a DRAFT Data Mart', async () => {
    const { service, composer } = createService();

    const result = await service.run(command());

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: ['channel', 'revenue'], limitConfig: 11 }),
      expect.anything(),
      undefined,
      expect.anything()
    );
    expect(result).toEqual({
      columns: [
        { name: 'channel', alias: 'Channel', type: 'STRING' },
        { name: 'revenue', type: 'INTEGER' },
      ],
      rows: [
        ['fb', 10],
        ['org', 8],
      ],
      rowCount: 2,
      limit: 10,
      truncated: false,
    });
  });

  it('keeps the other rows when a driver hands back an Invalid Date', async () => {
    const { service } = createService({
      batches: [
        new ReportDataBatch(
          [
            ['fb', new Date(Number.NaN)],
            ['org', 8],
          ],
          null
        ),
      ],
    });

    await expect(service.run(command())).resolves.toMatchObject({
      rows: [
        ['fb', '[Invalid Date]'],
        ['org', 8],
      ],
      rowCount: 2,
    });
  });

  it('checks the project operation gate like HTTP Data, without consuming anything', async () => {
    const { service, projectBilling } = createService();

    await service.run(command());

    expect(projectBilling.verifyCanPerformOperations).toHaveBeenCalledWith(
      'p1',
      RunKind.HTTP_DATA_RUN
    );
    expect(Object.keys(projectBilling)).toEqual(['verifyCanPerformOperations']);
  });

  it('reads nothing for a blocked project', async () => {
    const { service, composer, readerResolver } = createService({ blocked: true });

    await expect(service.run(command())).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    expect(composer.compose).not.toHaveBeenCalled();
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it('accepts the maximum limit of 1000', async () => {
    const { service, composer } = createService();

    await expect(service.run(command({ limit: 1000 }))).resolves.toMatchObject({ limit: 1000 });
    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ limitConfig: 1001 }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('flags truncation when the over-read row arrives', async () => {
    const { service } = createService({
      batches: [new ReportDataBatch([['a'], ['b'], ['c']], null)],
    });

    const result = await service.run(command({ limit: 2 }));

    expect(result.rows).toEqual([['a'], ['b']]);
    expect(result.truncated).toBe(true);
  });

  it('passes filters to the composer', async () => {
    const { service, composer } = createService();
    const filters = [{ column: 'channel', operator: 'contains', value: 'f' }];

    await service.run(command({ filters }));

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ filterConfig: filters }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('passes the sort to the composer as ORDER BY', async () => {
    const { service, composer } = createService();
    const sort = [{ column: 'revenue', direction: 'desc' }];

    await service.run(command({ sort }));

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ sortConfig: sort, limitConfig: 11 }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('rejects a malformed sort before touching the warehouse', async () => {
    const { service, readerResolver } = createService();

    await expect(
      service.run(command({ sort: [{ column: 'revenue', direction: 'down' }] }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it.each([0, 1001, 2.5])('rejects limit %p before touching anything', async limit => {
    const { service, composer } = createService();

    await expect(service.run(command({ limit }))).rejects.toBeInstanceOf(BadRequestException);
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('rejects malformed filters before touching the warehouse', async () => {
    const { service, readerResolver } = createService();

    await expect(
      service.run(command({ filters: [{ column: 'channel', operator: 'nope' }] }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot see the Data Mart', async () => {
    const { service, composer } = createService({ accessAllowed: false });

    await expect(service.run(command())).rejects.toBeInstanceOf(ForbiddenException);
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('projects a RECORD as one top-level column, not its nested paths', async () => {
    const { service, composer } = createService({
      nativeFields: [
        { name: 'id', type: 'INTEGER' },
        { name: 'device', type: 'RECORD', fields: [{ name: 'isBot', type: 'BOOLEAN' }] },
      ],
    });

    await service.run(command());

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: ['id', 'device'] }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('leaves out a field that is disconnected from the source', async () => {
    const { service, composer } = createService({
      nativeFields: [
        { name: 'id', type: 'INTEGER', status: DataMartSchemaFieldStatus.CONNECTED },
        { name: 'old_column', type: 'STRING', status: DataMartSchemaFieldStatus.DISCONNECTED },
        {
          name: 'revenue',
          type: 'FLOAT',
          status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH,
        },
      ],
    });

    await service.run(command());

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: ['id', 'revenue'] }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('asks to refresh the schema when every field is disconnected', async () => {
    const { service, composer } = createService({
      nativeFields: [
        { name: 'old_column', type: 'STRING', status: DataMartSchemaFieldStatus.DISCONNECTED },
      ],
    });

    await expect(service.run(command())).rejects.toBeInstanceOf(BadRequestException);
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('returns a warehouse read error through the storage error mapper', async () => {
    const { service, errorMapper } = createService({
      readerError: new Error('Unrecognized name: device'),
    });

    const failure = service.run(command());

    await expect(failure).rejects.toMatchObject({ status: HttpStatus.FAILED_DEPENDENCY });
    await expect(failure).rejects.toThrow(/Unrecognized name: device/);
    expect(errorMapper.toStorageReadError).toHaveBeenCalledWith(expect.any(Error), { force: true });
  });

  it('maps a failing compose (e.g. the SQL view DDL) like a read error, not a bare 500', async () => {
    const { service, readerResolver } = createService({
      composeError: new Error('Not found: Table project:dataset.source'),
    });

    const failure = service.run(command());

    await expect(failure).rejects.toMatchObject({ status: HttpStatus.FAILED_DEPENDENCY });
    await expect(failure).rejects.toThrow(/Not found: Table/);
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it('keeps a compose validation error as it is', async () => {
    const { service, errorMapper } = createService({
      composeError: new BadRequestException('Output controls validation failed'),
    });

    await expect(service.run(command())).rejects.toBeInstanceOf(BadRequestException);
    expect(errorMapper.toStorageReadError).not.toHaveBeenCalled();
  });

  it('keeps a composer rule violation for its own 400 filter, not the warehouse mapper', async () => {
    const violation = new BusinessViolationException('Sort field is not in the schema', {
      field: 'removed_column',
    });
    const { service, errorMapper, readerResolver } = createService({ composeError: violation });

    await expect(service.run(command())).rejects.toBe(violation);
    expect(errorMapper.toStorageReadError).not.toHaveBeenCalled();
    expect(readerResolver.resolve).not.toHaveBeenCalled();
  });

  it('reuses the computed schema when composing', async () => {
    const { service, composer } = createService();

    await service.run(command());

    expect(composer.compose).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ nativeFields: expect.any(Array) })
    );
  });

  it('asks to refresh the schema when there is nothing to project', async () => {
    const { service } = createService({ nativeFields: [] });

    await expect(service.run(command())).rejects.toThrow(/Refresh the schema/);
  });

  it('reports the deadline as a 504, never an auto-retried 408', async () => {
    const { service } = createService({ deadlineMs: 5, readerNeverResolves: true });

    await expect(service.run(command())).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('answers a cancel with 499', async () => {
    const { service } = createService({ readerNeverResolves: true });
    const controller = new AbortController();

    const pending = service.run(command(), controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 5);

    await expect(pending).rejects.toBeInstanceOf(PreviewAbortedError);
    await expect(pending).rejects.toMatchObject({ status: 499 });
  });

  it('stops the warehouse work when the caller cancels mid-read', async () => {
    const { service, reader } = createService({ readerNeverResolves: true });
    const controller = new AbortController();

    const pending = service.run(command(), controller.signal);
    await new Promise(resolve => setTimeout(resolve, 5));
    const workSignal = (reader.prepareReportData.mock.calls[0][1] as { signal: AbortSignal })
      .signal;
    expect(workSignal.aborted).toBe(false);

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(PreviewAbortedError);
    expect(workSignal.aborted).toBe(true);
  });

  it('starts no warehouse work when already cancelled', async () => {
    const { service, reader } = createService();
    const controller = new AbortController();
    controller.abort();

    await expect(service.run(command(), controller.signal)).rejects.toBeInstanceOf(
      PreviewAbortedError
    );
    expect(reader.prepareReportData).not.toHaveBeenCalled();
  });
});

describe('toPreviewCell', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['x', 'x'],
    [3, 3],
    [true, true],
    [BigInt('9007199254740993'), '9007199254740993'],
    [new Date('2026-01-02T03:04:05.000Z'), '2026-01-02T03:04:05.000Z'],
    // A DATE past JS Date's range, as Databricks builds it from Arrow: new Date(days * 86_400_000).
    [new Date(108_840_000 * 86_400_000), '[Invalid Date]'],
    [{ value: '2026-01-02' }, '2026-01-02'],
    [{ toJSON: () => '12.50' }, '12.50'],
    [{ a: 1, b: [2] }, '{"a":1,"b":[2]}'],
    [[1, 2], '[1,2]'],
  ])('maps %p to %p', (input, expected) => {
    expect(toPreviewCell(input)).toEqual(expected);
  });
});
