import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { StreamHttpDataCommand } from '../dto/domain/stream-http-data.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AccessDecisionService } from '../services/access-decision/access-decision.service';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { ReportTotalsService } from '../services/report-totals.service';
import { HttpDataColumnResolver } from '../services/http-data/http-data-column-resolver.service';
import { HttpDataColumnValidator } from '../services/http-data/http-data-column-validator.service';
import { HttpDataRequestValidator } from '../services/http-data/http-data-request-validator.service';
import { HttpDataStreamWriter } from '../services/http-data/http-data-stream-writer.service';
import { HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS } from '../services/http-data/http-data.constants';
import { StreamHttpDataService } from './stream-http-data.service';

function fakeCommand(overrides: Partial<StreamHttpDataCommand> = {}): StreamHttpDataCommand {
  return {
    dataMartId: 'dm-1',
    userId: 'user-1',
    projectId: 'proj-1',
    roles: ['viewer'],
    rawQuery: { column: ['date', 'revenue'] },
    ...overrides,
  };
}

function fakeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    status: DataMartStatus.PUBLISHED,
    storage: { type: DataStorageType.SNOWFLAKE, id: 'storage-1', title: 'warehouse' },
    definition: { kind: 'sql', sql: 'SELECT 1' },
    title: 'My DM',
    ...overrides,
  } as unknown as DataMart;
}

function storageAccessDeniedError(): Error {
  const message = 'Access Denied: missing storage.objects.read permission.';
  const error = new Error(message) as Error & {
    errors: Array<{ reason: string; message: string }>;
    response: {
      status: { errorResult: { reason: string; message: string } };
    };
  };
  error.errors = [{ reason: 'accessDenied', message }];
  error.response = {
    status: { errorResult: { reason: 'accessDenied', message } },
  };
  return error;
}

function providerReason(error: unknown): string | undefined {
  const shaped = error as {
    errors?: Array<{ reason?: string }>;
    response?: { status?: { errorResult?: { reason?: string } } };
  };
  return shaped.response?.status?.errorResult?.reason ?? shaped.errors?.[0]?.reason;
}

function storageReadFailure(error: unknown): HttpException {
  const message = error instanceof Error ? error.message : String(error);
  const reason = providerReason(error);
  const providerStatusCode = reason === 'accessDenied' ? HttpStatus.FORBIDDEN : undefined;

  return new HttpException(
    {
      code: reason === 'accessDenied' ? 'STORAGE_PERMISSION_DENIED' : 'STORAGE_READ_FAILED',
      message: `Storage dependency failed while reading this Data Mart data: Test storage returned an error: ${message}`,
      details: {
        dependency: 'storage',
        providerMessage: message,
        providerName: 'Test storage',
        ...(reason ? { providerReason: reason } : {}),
        ...(providerStatusCode ? { providerStatusCode } : {}),
        storageType: DataStorageType.SNOWFLAKE,
      },
    },
    HttpStatus.FAILED_DEPENDENCY
  );
}

type MockResponse = Response & {
  _writes: string[];
  _closed: boolean;
  _destroyed: boolean;
  _emit: (event: string, arg?: unknown) => void;
};

function mockResponse(): MockResponse {
  const writes: string[] = [];
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  let closed = false;
  let destroyed = false;
  let headersSent = false;

  const res = {
    get _writes() {
      return writes;
    },
    get _closed() {
      return closed;
    },
    get _destroyed() {
      return destroyed;
    },
    get closed() {
      return closed;
    },
    get headersSent() {
      return headersSent;
    },
    setHeader: jest.fn(),
    flushHeaders: jest.fn(() => {
      headersSent = true;
    }),
    write(chunk: Buffer | string) {
      writes.push(chunk.toString('utf-8' as never));
      headersSent = true;
      return true;
    },
    once(event: string, cb: (arg?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      return res;
    },
    off(event: string, cb: (arg?: unknown) => void) {
      listeners[event] = (listeners[event] ?? []).filter(listener => listener !== cb);
      return res;
    },
    end: jest.fn(),
    destroy(_err?: Error) {
      destroyed = true;
      closed = true;
    },
    _emit(event: string, arg?: unknown) {
      const fired = listeners[event] ?? [];
      listeners[event] = [];
      fired.forEach(listener => listener(arg));
    },
  } as unknown as MockResponse;

  return res;
}

describe('StreamHttpDataService', () => {
  let requestValidator: jest.Mocked<HttpDataRequestValidator>;
  let columnResolver: jest.Mocked<HttpDataColumnResolver>;
  let columnValidator: jest.Mocked<HttpDataColumnValidator>;
  let streamWriter: HttpDataStreamWriter;
  let dataMartRunService: jest.Mocked<DataMartRunService>;
  let dataMartService: jest.Mocked<DataMartService>;
  let access: jest.Mocked<AccessDecisionService>;
  let blendableSchema: jest.Mocked<BlendableSchemaService>;
  let blended: jest.Mocked<BlendedReportDataService>;
  let sqlComposer: jest.Mocked<ReportSqlComposerService>;
  let balance: jest.Mocked<ProjectBalanceService>;
  let consumption: jest.Mocked<ConsumptionTrackingService>;
  let gracefulShutdown: jest.Mocked<GracefulShutdownService>;
  let systemTime: jest.Mocked<SystemTimeService>;
  let reader: jest.Mocked<DataStorageReportReader>;
  let readerResolver: jest.Mocked<TypeResolver<DataStorageType, DataStorageReportReader>>;
  let errorMapper: jest.Mocked<DataStorageErrorMapper>;
  let errorMapperResolver: jest.Mocked<TypeResolver<DataStorageType, DataStorageErrorMapper>>;
  let reportTotals: jest.Mocked<ReportTotalsService>;
  let service: StreamHttpDataService;

  beforeEach(() => {
    requestValidator = {
      validate: jest.fn(rawQuery => ({
        columnSelector: {
          mode: 'explicit' as const,
          explicit: (rawQuery as { column: string[] }).column,
        },
        filter: undefined,
        sort: undefined,
        limit: undefined,
      })),
    } as unknown as jest.Mocked<HttpDataRequestValidator>;

    columnResolver = {
      resolve: jest.fn((selector, columns) =>
        selector.mode === 'explicit' ? selector.explicit : columns.native
      ),
    } as unknown as jest.Mocked<HttpDataColumnResolver>;

    columnValidator = {
      validate: jest.fn(() => undefined),
    } as unknown as jest.Mocked<HttpDataColumnValidator>;

    blendableSchema = {
      computeBlendableSchema: jest.fn(async () => ({
        nativeFields: [{ name: 'date' }, { name: 'revenue' }],
        blendedFields: [],
        availableSources: [],
      })),
    } as unknown as jest.Mocked<BlendableSchemaService>;

    streamWriter = new HttpDataStreamWriter();

    const dm = fakeDataMart();
    dataMartRunService = {
      recordHttpDataRun: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<DataMartRunService>;

    dataMartService = {
      getByIdAndProjectId: jest.fn(async () => dm),
      actualizeSchemaInEntityIfExpired: jest.fn(async (entity: typeof dm) => entity),
    } as unknown as jest.Mocked<DataMartService>;

    gracefulShutdown = {
      isInShutdownMode: jest.fn(() => false),
    } as unknown as jest.Mocked<GracefulShutdownService>;

    systemTime = {
      now: jest.fn(() => new Date('2026-05-29T00:00:00.000Z')),
    } as unknown as jest.Mocked<SystemTimeService>;

    access = {
      canAccess: jest.fn(async () => true),
    } as unknown as jest.Mocked<AccessDecisionService>;

    blended = {
      resolveBlendingDecision: jest.fn(async () => ({ needsBlending: false })),
    } as unknown as jest.Mocked<BlendedReportDataService>;

    sqlComposer = {
      compose: jest.fn(async () => ({ sql: 'SELECT * FROM t LIMIT 3' })),
    } as unknown as jest.Mocked<ReportSqlComposerService>;

    balance = {
      verifyCanPerformOperations: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<ProjectBalanceService>;

    consumption = {
      registerHttpDataRunConsumption: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<ConsumptionTrackingService>;

    reader = {
      prepareReportData: jest.fn(
        async () =>
          new ReportDataDescription([new ReportDataHeader('date'), new ReportDataHeader('revenue')])
      ),
      readReportDataBatch: jest.fn(
        async () =>
          new ReportDataBatch(
            [
              ['2026-05-01', 42],
              ['2026-05-02', 51],
            ],
            null
          )
      ),
      finalize: jest.fn(async () => undefined),
      getState: jest.fn(() => null),
      initFromState: jest.fn(async () => undefined),
      type: DataStorageType.SNOWFLAKE,
    } as unknown as jest.Mocked<DataStorageReportReader>;

    readerResolver = {
      resolve: jest.fn(async () => reader),
    } as unknown as jest.Mocked<TypeResolver<DataStorageType, DataStorageReportReader>>;

    errorMapper = {
      type: DataStorageType.SNOWFLAKE,
      toStorageReadError: jest.fn((error, options) =>
        error instanceof HttpException || !options?.force ? error : storageReadFailure(error)
      ),
    } as unknown as jest.Mocked<DataStorageErrorMapper>;

    errorMapperResolver = {
      resolve: jest.fn(async () => errorMapper),
    } as unknown as jest.Mocked<TypeResolver<DataStorageType, DataStorageErrorMapper>>;

    reportTotals = {
      // Default: not aggregated -> no totals.
      computeTotals: jest.fn(async () => null),
    } as unknown as jest.Mocked<ReportTotalsService>;

    service = new StreamHttpDataService(
      requestValidator,
      columnResolver,
      columnValidator,
      streamWriter,
      dataMartRunService,
      dataMartService,
      access,
      blendableSchema,
      blended,
      sqlComposer,
      balance,
      consumption,
      gracefulShutdown,
      systemTime,
      readerResolver,
      errorMapperResolver,
      reportTotals
    );
  });

  it('happy path streams two NDJSON rows, records a SUCCESS run, registers consumption', async () => {
    const res = mockResponse();
    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual([
      '{"date":"2026-05-01","revenue":42}\n',
      '{"date":"2026-05-02","revenue":51}\n',
    ]);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledTimes(1);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        createdById: 'user-1',
        metadata: expect.objectContaining({ rowCount: 2, completed: true }),
      })
    );
    expect(consumption.registerHttpDataRunConsumption).toHaveBeenCalled();
    expect(reader.finalize).toHaveBeenCalled();
  });

  it('computes totals before streaming and persists them under the run metadata', async () => {
    const totals = { 'revenue | SUM': 93, 'Row Count': 2 };
    reportTotals.computeTotals.mockResolvedValueOnce(totals);
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    // Totals are computed before any row is streamed (headers/body flushed).
    const totalsOrder = (reportTotals.computeTotals as jest.Mock).mock.invocationCallOrder[0];
    const firstReadOrder = (reader.readReportDataBatch as jest.Mock).mock.invocationCallOrder[0];
    expect(totalsOrder).toBeLessThan(firstReadOrder);

    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({ totals }),
      })
    );
  });

  it('still sets x-owox-run-id and streams when totals computation throws (best-effort)', async () => {
    reportTotals.computeTotals.mockRejectedValueOnce(new Error('totals query exploded'));
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    // Stream is unaffected: both rows are written and a SUCCESS run is recorded.
    expect(res._writes).toEqual([
      '{"date":"2026-05-01","revenue":42}\n',
      '{"date":"2026-05-02","revenue":51}\n',
    ]);
    const setRunIdHeader = (res.setHeader as jest.Mock).mock.calls.find(
      ([name]) => String(name).toLowerCase() === 'x-owox-run-id'
    );
    expect(setRunIdHeader).toBeDefined();
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.not.objectContaining({ totals: expect.anything() }),
      })
    );
  });

  it('emits no NDJSON envelope (no type/meta/done/error markers)', async () => {
    const res = mockResponse();
    await service.stream(fakeCommand(), res);
    const joined = res._writes.join('');
    expect(joined).not.toMatch(/"type"\s*:/);
    expect(joined).not.toMatch(/"meta"|"done"/);
  });

  it('returns 404 for DRAFT data mart (without leaking existence)', async () => {
    dataMartService.getByIdAndProjectId.mockResolvedValueOnce(
      fakeDataMart({ status: DataMartStatus.DRAFT })
    );
    await expect(service.stream(fakeCommand(), mockResponse())).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(dataMartRunService.recordHttpDataRun).not.toHaveBeenCalled();
  });

  it('returns 403 when caller has no USE on the Data Mart and records no run', async () => {
    access.canAccess.mockResolvedValueOnce(false);
    await expect(service.stream(fakeCommand(), mockResponse())).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(dataMartRunService.recordHttpDataRun).not.toHaveBeenCalled();
  });

  it('records a FAILED run when prepareReportData fails before headers are sent', async () => {
    reader.prepareReportData.mockRejectedValueOnce(new Error('schema mismatch'));
    const res = mockResponse();
    await expect(service.stream(fakeCommand(), res)).rejects.toMatchObject({
      status: HttpStatus.FAILED_DEPENDENCY,
    });
    expect(res._writes).toHaveLength(0);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledTimes(1);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        metadata: expect.objectContaining({ completed: false }),
        errors: expect.arrayContaining([
          expect.stringContaining('Storage dependency failed while reading this Data Mart data'),
        ]),
      })
    );
  });

  it('maps storage provider failures before reader resolution to failed dependency', async () => {
    dataMartService.actualizeSchemaInEntityIfExpired.mockRejectedValueOnce(
      storageAccessDeniedError()
    );
    const res = mockResponse();

    await expect(service.stream(fakeCommand(), res)).rejects.toMatchObject({
      status: HttpStatus.FAILED_DEPENDENCY,
      response: expect.objectContaining({
        code: 'STORAGE_PERMISSION_DENIED',
        details: expect.objectContaining({
          dependency: 'storage',
          providerReason: 'accessDenied',
          providerStatusCode: 403,
          storageType: DataStorageType.SNOWFLAKE,
        }),
      }),
    });
    expect(readerResolver.resolve).not.toHaveBeenCalled();
    expect(errorMapperResolver.resolve).toHaveBeenCalledWith(DataStorageType.SNOWFLAKE);
    expect(errorMapper.toStorageReadError).toHaveBeenCalledWith(expect.any(Error), {
      force: true,
    });
    expect(dataMartRunService.recordHttpDataRun).not.toHaveBeenCalled();
  });

  it('defers the 200 response until the first batch read succeeds', async () => {
    reader.readReportDataBatch.mockRejectedValueOnce(new Error('relation does not exist'));
    const res = mockResponse();

    await expect(service.stream(fakeCommand(), res)).rejects.toMatchObject({
      status: HttpStatus.FAILED_DEPENDENCY,
    });
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(res._writes).toHaveLength(0);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        errors: expect.arrayContaining([
          expect.stringContaining('Storage dependency failed while reading this Data Mart data'),
        ]),
      })
    );
  });

  it('flushes NDJSON headers only after the first batch read', async () => {
    const res = mockResponse();
    await service.stream(fakeCommand(), res);
    const firstReadOrder = (reader.readReportDataBatch as jest.Mock).mock.invocationCallOrder[0];
    const flushOrder = (res.flushHeaders as jest.Mock).mock.invocationCallOrder[0];
    expect(firstReadOrder).toBeLessThan(flushOrder);
  });

  it('rejects with 503 when application is in graceful shutdown mode', async () => {
    gracefulShutdown.isInShutdownMode.mockReturnValueOnce(true);
    await expect(service.stream(fakeCommand(), mockResponse())).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('persists the actualized schema (if expired) on the accessible mart before column validation', async () => {
    const res = mockResponse();
    await service.stream(fakeCommand(), res);

    expect(dataMartService.actualizeSchemaInEntityIfExpired).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dm-1' }),
      HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS
    );
    const actualizeOrder = (dataMartService.actualizeSchemaInEntityIfExpired as jest.Mock).mock
      .invocationCallOrder[0];
    const validateOrder = (columnValidator.validate as jest.Mock).mock.invocationCallOrder[0];
    const getOrder = (dataMartService.getByIdAndProjectId as jest.Mock).mock.invocationCallOrder[0];
    expect(getOrder).toBeLessThan(actualizeOrder);
    expect(actualizeOrder).toBeLessThan(validateOrder);
    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledTimes(1);
  });

  it('skips consumption and does not record a FAILED run when the SUCCESS write fails', async () => {
    dataMartRunService.recordHttpDataRun.mockRejectedValueOnce(new Error('db down'));
    const res = mockResponse();

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledTimes(1);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
    expect(consumption.registerHttpDataRunConsumption).not.toHaveBeenCalled();
  });

  it('still resolves when consumption tracking throws after a SUCCESS run', async () => {
    consumption.registerHttpDataRunConsumption.mockRejectedValueOnce(new Error('pubsub down'));
    const res = mockResponse();

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledTimes(1);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
  });

  it('persists dataDescription headers in the SUCCESS run metadata', async () => {
    const res = mockResponse();
    await service.stream(fakeCommand(), res);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({
          dataDescription: {
            dataHeaders: [
              expect.objectContaining({ name: 'date' }),
              expect.objectContaining({ name: 'revenue' }),
            ],
          },
        }),
      })
    );
  });

  it('streams every row across multiple reader batches in order', async () => {
    reader.readReportDataBatch
      .mockResolvedValueOnce(new ReportDataBatch([['2026-05-01', 1]], 'batch-2'))
      .mockResolvedValueOnce(new ReportDataBatch([['2026-05-02', 2]], null));
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual([
      '{"date":"2026-05-01","revenue":1}\n',
      '{"date":"2026-05-02","revenue":2}\n',
    ]);
    expect(reader.readReportDataBatch).toHaveBeenNthCalledWith(2, 'batch-2', expect.any(Number));
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({ rowCount: 2, completed: true }),
      })
    );
  });

  it('records a FAILED run and destroys the response when the client disconnects mid-stream', async () => {
    const res = mockResponse();
    reader.readReportDataBatch.mockImplementationOnce(async () => {
      res._emit('close');
      return new ReportDataBatch([['2026-05-01', 1]], 'batch-2');
    });

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();

    expect(res._destroyed).toBe(true);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        metadata: expect.objectContaining({ completed: false }),
        errors: expect.arrayContaining([expect.stringContaining('Client disconnected')]),
      })
    );
  });

  it('records a FAILED run and destroys the response when the response emits an error mid-stream', async () => {
    const res = mockResponse();
    reader.readReportDataBatch.mockImplementationOnce(async () => {
      res._emit('error', new Error('socket reset by peer'));
      return new ReportDataBatch([['2026-05-01', 1]], 'batch-2');
    });

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();

    expect(res._destroyed).toBe(true);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        metadata: expect.objectContaining({ completed: false }),
        errors: expect.arrayContaining([expect.stringContaining('socket reset by peer')]),
      })
    );
  });

  it('records a FAILED run when a row write rejects (disconnect during backpressure)', async () => {
    const res = mockResponse();
    const writeChunkSpy = jest
      .spyOn(streamWriter, 'writeChunk')
      .mockRejectedValueOnce(new Error('Response stream closed before backpressure drained'));

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();

    expect(res._destroyed).toBe(true);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        metadata: expect.objectContaining({ completed: false }),
        errors: expect.arrayContaining([expect.stringContaining('backpressure drained')]),
      })
    );
    writeChunkSpy.mockRestore();
  });

  it('records a FAILED run and destroys the response when shutdown begins mid-stream', async () => {
    gracefulShutdown.isInShutdownMode
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-05-01', 1]], 'batch-2')
    );
    const res = mockResponse();

    await expect(service.stream(fakeCommand(), res)).resolves.toBeUndefined();

    expect(res._destroyed).toBe(true);
    expect(res._writes).toEqual(['{"date":"2026-05-01","revenue":1}\n']);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        errors: expect.arrayContaining([expect.stringContaining('shutdown mode')]),
      })
    );
  });

  it('composes SQL with the requested limit', async () => {
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit' as const, explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation: undefined,
      dateTrunc: undefined,
      limit: 5,
    });
    await service.stream(fakeCommand(), mockResponse());

    expect(sqlComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ limitConfig: 5 }),
      expect.anything(),
      expect.anything()
    );
  });

  it('does not compose SQL when no filter/sort/limit is requested', async () => {
    await service.stream(fakeCommand(), mockResponse());
    expect(sqlComposer.compose).not.toHaveBeenCalled();
  });

  it('records decoded filter/sort/limit in the run metadata', async () => {
    const filter = [{ column: 'date', operator: 'gte', value: '2026-05-01' }];
    const sort = [{ column: 'date', direction: 'desc' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date'] },
      filter,
      sort,
      limit: 5,
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({
          format: 'ndjson',
          columns: ['date'],
          filter,
          sort,
          limit: 5,
        }),
      })
    );
  });

  it('composes SQL when only an aggregation is requested (no filter/sort/limit)', async () => {
    const aggregation = [{ column: 'revenue', function: 'SUM' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation,
      dateTrunc: undefined,
      limit: undefined,
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(sqlComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ aggregationConfig: aggregation }),
      expect.anything(),
      expect.anything()
    );
  });

  it('composes SQL when only a date bucket is requested (no filter/sort/limit)', async () => {
    const dateTrunc = [{ column: 'date', unit: 'MONTH' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation: undefined,
      dateTrunc,
      limit: undefined,
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(sqlComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ dateTruncConfig: dateTrunc }),
      expect.anything(),
      expect.anything()
    );
  });

  it('passes aggregation and date-trunc columns to the column validator', async () => {
    const aggregation = [{ column: 'revenue', function: 'SUM' }];
    const dateTrunc = [{ column: 'date', unit: 'MONTH' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation,
      dateTrunc,
      limit: undefined,
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(columnValidator.validate).toHaveBeenCalledWith(
      expect.objectContaining({ aggregation, dateTrunc }),
      expect.anything()
    );
  });

  it('records decoded aggregation/dateTrunc in the run metadata', async () => {
    const aggregation = [{ column: 'revenue', function: 'SUM' }];
    const dateTrunc = [{ column: 'date', unit: 'MONTH' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date'] },
      filter: undefined,
      sort: undefined,
      aggregation,
      dateTrunc,
      limit: undefined,
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({ aggregation, dateTrunc }),
      })
    );
  });

  it('streams the aggregated (renamed) headers and Row Count, not the raw requested columns', async () => {
    // The reader renames an aggregated column's header to its "<column> | <FN>" output label and
    // appends Row Count (see resolveReportDataHeaders). The stream must project rows by those
    // resolved header names, else the aggregated metric is emitted as null and Row Count is dropped.
    const aggregation = [{ column: 'revenue', function: 'SUM' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation,
      dateTrunc: undefined,
      limit: undefined,
    } as never);
    reader.prepareReportData.mockResolvedValueOnce(
      new ReportDataDescription([
        new ReportDataHeader('date'),
        new ReportDataHeader('revenue | SUM'),
        new ReportDataHeader('Row Count'),
      ])
    );
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-05-01', 93, 2]], null)
    );
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual(['{"date":"2026-05-01","revenue | SUM":93,"Row Count":2}\n']);
  });

  it('streams a date-bucket-only request by the requested column names (headers are not renamed)', async () => {
    // date-trunc keeps its output alias equal to the column name (DATE_TRUNC(...) AS date), so the
    // resolved headers still match the requested columns → requested-column projection is correct.
    const dateTrunc = [{ column: 'date', unit: 'MONTH' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation: undefined,
      dateTrunc,
      limit: undefined,
    } as never);
    reader.prepareReportData.mockResolvedValueOnce(
      new ReportDataDescription([new ReportDataHeader('date'), new ReportDataHeader('revenue')])
    );
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-05-01', 42]], null)
    );
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual(['{"date":"2026-05-01","revenue":42}\n']);
  });

  it('streams aggregation + date-bucket by the resolved (renamed) header names', async () => {
    const aggregation = [{ column: 'revenue', function: 'SUM' }];
    const dateTrunc = [{ column: 'date', unit: 'MONTH' }];
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'explicit', explicit: ['date', 'revenue'] },
      filter: undefined,
      sort: undefined,
      aggregation,
      dateTrunc,
      limit: undefined,
    } as never);
    reader.prepareReportData.mockResolvedValueOnce(
      new ReportDataDescription([
        new ReportDataHeader('date'),
        new ReportDataHeader('revenue | SUM'),
        new ReportDataHeader('Row Count'),
      ])
    );
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-01-01', 300, 3]], null)
    );
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual(['{"date":"2026-01-01","revenue | SUM":300,"Row Count":3}\n']);
  });

  it('rejects via the read/abort race when the client disconnects during a pending first batch read', async () => {
    reader.readReportDataBatch.mockImplementationOnce(() => new Promise<never>(() => {}));
    const res = mockResponse();

    const streamed = service.stream(fakeCommand(), res);
    await new Promise(resolve => setImmediate(resolve));
    res._emit('close');

    await expect(streamed).rejects.toThrow('Client disconnected');
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        errors: expect.arrayContaining([expect.stringContaining('Client disconnected')]),
      })
    );
  });

  it('resolves an all-blendable selector and streams every resolved column', async () => {
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'allBlendable' as const },
      filter: undefined,
      sort: undefined,
      aggregation: undefined,
      dateTrunc: undefined,
      limit: undefined,
    });
    columnResolver.resolve.mockReturnValueOnce(['date', 'revenue', 'orders__cost']);
    reader.prepareReportData.mockResolvedValueOnce(
      new ReportDataDescription([
        new ReportDataHeader('date'),
        new ReportDataHeader('revenue'),
        new ReportDataHeader('orders__cost'),
      ])
    );
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-05-01', 42, 7]], null)
    );
    const res = mockResponse();

    await service.stream(fakeCommand(), res);

    expect(res._writes).toEqual(['{"date":"2026-05-01","revenue":42,"orders__cost":7}\n']);
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        metadata: expect.objectContaining({ columns: ['date', 'revenue', 'orders__cost'] }),
      })
    );
  });

  it('does not offer inaccessible blended columns to the all-blendable selector', async () => {
    requestValidator.validate.mockReturnValueOnce({
      columnSelector: { mode: 'allBlendable' as const },
      filter: undefined,
      sort: undefined,
      aggregation: undefined,
      dateTrunc: undefined,
      limit: undefined,
    });
    blendableSchema.computeBlendableSchema.mockResolvedValueOnce({
      nativeFields: [{ name: 'date' }],
      availableSources: [
        { aliasPath: 'orders', isIncluded: true, isAccessibleForReporting: true },
        { aliasPath: 'secret', isIncluded: true, isAccessibleForReporting: false },
      ],
      blendedFields: [
        { name: 'orders__cost', aliasPath: 'orders', isHidden: false },
        { name: 'secret__margin', aliasPath: 'secret', isHidden: false },
      ],
    } as never);
    columnResolver.resolve.mockImplementationOnce((_selector, columns) => [
      ...columns.native,
      ...columns.blended,
    ]);
    reader.prepareReportData.mockResolvedValueOnce(
      new ReportDataDescription([
        new ReportDataHeader('date'),
        new ReportDataHeader('orders__cost'),
      ])
    );
    reader.readReportDataBatch.mockResolvedValueOnce(
      new ReportDataBatch([['2026-05-01', 7]], null)
    );

    await service.stream(fakeCommand(), mockResponse());

    expect(columnResolver.resolve).toHaveBeenCalledWith(
      { mode: 'allBlendable' },
      { native: ['date'], blended: ['orders__cost'] }
    );
    expect(blended.resolveBlendingDecision).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: ['date', 'orders__cost'] }),
      { userId: 'user-1', roles: ['viewer'] }
    );
  });

  it('uses the blended SQL as sqlOverride when the decision needs blending', async () => {
    blended.resolveBlendingDecision.mockResolvedValueOnce({
      needsBlending: true,
      blendedSql: 'SELECT * FROM blend',
      params: [{ name: 'p', value: 1 }],
    } as never);

    await service.stream(fakeCommand(), mockResponse());

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sqlOverride: 'SELECT * FROM blend' })
    );
    expect(sqlComposer.compose).not.toHaveBeenCalled();
    expect(dataMartRunService.recordHttpDataRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
  });

  it('throws and records no run when blending is required but no blended SQL is produced', async () => {
    blended.resolveBlendingDecision.mockResolvedValueOnce({
      needsBlending: true,
      blendedSql: undefined,
    } as never);

    await expect(service.stream(fakeCommand(), mockResponse())).rejects.toBeInstanceOf(
      InternalServerErrorException
    );
    expect(dataMartRunService.recordHttpDataRun).not.toHaveBeenCalled();
  });
});
