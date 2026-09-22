import { BadRequestException, ForbiddenException, RequestTimeoutException } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
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
    storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
  };

  const command = (overrides: { limit?: number; filters?: unknown } = {}) =>
    new PreviewDataMartCommand(
      'dm1',
      'p1',
      'user-1',
      [],
      'limit' in overrides ? overrides.limit : undefined,
      overrides.filters
    );

  const createService = (
    overrides: {
      batches?: ReportDataBatch[];
      accessAllowed?: boolean;
      balanceAllowed?: boolean;
      nativeFields?: { name: string; type: string }[];
      deadlineMs?: number;
      readerNeverResolves?: boolean;
      recordFails?: boolean;
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
      compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
      inlineStaticSql: jest.fn((_type: unknown, sql: string) => sql),
    };
    const reader = {
      prepareReportData: jest
        .fn()
        .mockImplementation(() =>
          overrides.readerNeverResolves
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
    const dataMartRunService = {
      recordPreviewRun: overrides.recordFails
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(overrides.accessAllowed ?? true),
    };
    const projectBilling = {
      verifyCanPerformOperations:
        overrides.balanceAllowed === false
          ? jest
              .fn()
              .mockRejectedValue(
                new ProjectOperationBlockedException([
                  ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED,
                ])
              )
          : jest.fn().mockResolvedValue(undefined),
      registerDataMartPreviewRunConsumption: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PreviewDataMartService(
      dataMartService as never,
      blendableSchemaService as never,
      composer as never,
      readerResolver as never,
      dataMartRunService as never,
      accessDecisionService as never,
      projectBilling as never,
      overrides.deadlineMs ?? 3_600_000
    );
    return { service, composer, reader, dataMartRunService, projectBilling };
  };

  it('reads the default 10 rows (+1 to detect more) from a DRAFT Data Mart, records and bills the run', async () => {
    const { service, composer, dataMartRunService, projectBilling } = createService();

    const result = await service.run(command());

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: ['channel', 'revenue'], limitConfig: 11 }),
      expect.anything()
    );
    expect(result).toMatchObject({
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
    expect(projectBilling.verifyCanPerformOperations).toHaveBeenCalledWith(
      'p1',
      RunKind.DATA_MART_PREVIEW_RUN
    );
    expect(dataMartRunService.recordPreviewRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: result.runId,
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({ rowCount: 2, filterCount: 0, query: { limit: 10 } }),
      })
    );
    expect(projectBilling.registerDataMartPreviewRunConsumption).toHaveBeenCalledWith(
      dataMart,
      result.runId
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

  it('passes filters to the composer and journals them', async () => {
    const { service, composer, dataMartRunService } = createService();
    const filters = [{ column: 'channel', operator: 'contains', value: 'f' }];

    await service.run(command({ filters }));

    expect(composer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ filterConfig: filters }),
      expect.anything()
    );
    expect(dataMartRunService.recordPreviewRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ filterCount: 1, query: { filters, limit: 10 } }),
      })
    );
  });

  it.each([0, 1001, 2.5])('rejects limit %p before touching anything', async limit => {
    const { service, composer, dataMartRunService } = createService();

    await expect(service.run(command({ limit }))).rejects.toBeInstanceOf(BadRequestException);
    expect(composer.compose).not.toHaveBeenCalled();
    expect(dataMartRunService.recordPreviewRun).not.toHaveBeenCalled();
  });

  it('rejects malformed filters without recording a run', async () => {
    const { service, dataMartRunService } = createService();

    await expect(
      service.run(command({ filters: [{ column: 'channel', operator: 'nope' }] }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataMartRunService.recordPreviewRun).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot see the Data Mart', async () => {
    const { service, composer } = createService({ accessAllowed: false });

    await expect(service.run(command())).rejects.toBeInstanceOf(ForbiddenException);
    expect(composer.compose).not.toHaveBeenCalled();
  });

  it('asks to refresh the schema when there is nothing to project', async () => {
    const { service } = createService({ nativeFields: [] });

    await expect(service.run(command())).rejects.toThrow(/Refresh the schema/);
  });

  it('records a RESTRICTED run and reads nothing when the billing gate blocks', async () => {
    const { service, reader, dataMartRunService, projectBilling } = createService({
      balanceAllowed: false,
    });

    await expect(service.run(command())).rejects.toBeInstanceOf(ProjectOperationBlockedException);
    expect(reader.prepareReportData).not.toHaveBeenCalled();
    expect(dataMartRunService.recordPreviewRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataMartRunStatus.RESTRICTED })
    );
    expect(projectBilling.registerDataMartPreviewRunConsumption).not.toHaveBeenCalled();
  });

  it('records a FAILED run on timeout and does not bill it', async () => {
    const { service, dataMartRunService, projectBilling } = createService({
      deadlineMs: 5,
      readerNeverResolves: true,
    });

    await expect(service.run(command())).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(dataMartRunService.recordPreviewRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataMartRunStatus.FAILED })
    );
    expect(projectBilling.registerDataMartPreviewRunConsumption).not.toHaveBeenCalled();
  });

  it('records nothing and bills nothing when the caller cancels', async () => {
    const { service, dataMartRunService, projectBilling } = createService({
      readerNeverResolves: true,
    });
    const controller = new AbortController();

    const pending = service.run(command(), controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 5);

    await expect(pending).rejects.toBeInstanceOf(PreviewAbortedError);
    expect(dataMartRunService.recordPreviewRun).not.toHaveBeenCalled();
    expect(projectBilling.registerDataMartPreviewRunConsumption).not.toHaveBeenCalled();
  });

  it('does not bill a successful read whose run could not be recorded', async () => {
    const { service, projectBilling } = createService({ recordFails: true });

    await expect(service.run(command())).resolves.toMatchObject({ rowCount: 2 });
    expect(projectBilling.registerDataMartPreviewRunConsumption).not.toHaveBeenCalled();
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
    [{ value: '2026-01-02' }, '2026-01-02'],
    [{ toJSON: () => '12.50' }, '12.50'],
    [{ a: 1, b: [2] }, '{"a":1,"b":[2]}'],
    [[1, 2], '[1,2]'],
  ])('maps %p to %p', (input, expected) => {
    expect(toPreviewCell(input)).toEqual(expected);
  });
});
