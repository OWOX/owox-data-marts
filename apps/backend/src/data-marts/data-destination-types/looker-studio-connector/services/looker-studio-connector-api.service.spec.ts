import { Response } from 'express';
import { Report } from '../../../entities/report.entity';
import { GetDataRequest } from '../schemas/get-data.schema';

// Mock external modules before importing service
jest.mock('@owox/internal-helpers', () => ({
  createProducer: jest.fn(),
  BaseEvent: class {
    constructor(public payload: unknown) {}
  },
}));

// Import after mocking
import { SystemTimeService } from '../../../../common/scheduler/services/system-time.service';
import { BlendedReportDataService } from '../../../services/blended-report-data.service';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import { LookerStudioReportRunService } from '../../../services/looker-studio-report-run.service';
import { ProjectBalanceService } from '../../../services/project-balance.service';
import { ReportDataCacheService } from '../../../services/report-data-cache.service';
import { ReportService } from '../../../services/report.service';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { LookerStudioConnectorApiService } from './looker-studio-connector-api.service';

describe('LookerStudioConnectorApiService', () => {
  let service: LookerStudioConnectorApiService;
  let dataService: jest.Mocked<LookerStudioConnectorApiDataService>;
  let cacheService: jest.Mocked<ReportDataCacheService>;
  let reportService: jest.Mocked<ReportService>;
  let reportRunService: jest.Mocked<LookerStudioReportRunService>;
  let consumptionTrackingService: jest.Mocked<ConsumptionTrackingService>;
  let projectBalanceService: jest.Mocked<ProjectBalanceService>;
  let eventDispatcher: jest.Mocked<{ publishExternal: jest.Mock }>;
  let blendedReportDataService: jest.Mocked<BlendedReportDataService>;
  let systemTimeService: jest.Mocked<SystemTimeService>;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    dataService = {
      getData: jest.fn(),
      prepareStreamingContext: jest.fn(),
      streamData: jest.fn(),
    } as unknown as jest.Mocked<LookerStudioConnectorApiDataService>;

    cacheService = {
      getOrCreateCachedReader: jest.fn(),
    } as unknown as jest.Mocked<ReportDataCacheService>;

    reportService = {
      getByIdAndLookerStudioSecret: jest.fn(),
    } as unknown as jest.Mocked<ReportService>;

    reportRunService = {
      create: jest.fn(),
      finish: jest.fn(),
    } as unknown as jest.Mocked<LookerStudioReportRunService>;

    consumptionTrackingService = {
      registerLookerReportRunConsumption: jest.fn(),
    } as unknown as jest.Mocked<ConsumptionTrackingService>;

    projectBalanceService = {
      verifyCanPerformOperations: jest.fn(),
    } as unknown as jest.Mocked<ProjectBalanceService>;

    eventDispatcher = {
      publishExternal: jest.fn(),
    };

    blendedReportDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue({ needsBlending: false }),
      logBlendedSqlIfNeeded: jest.fn(),
    } as unknown as jest.Mocked<BlendedReportDataService>;

    systemTimeService = {
      now: jest.fn().mockReturnValue(new Date('2026-04-17T00:00:00.000Z').toISOString()),
    } as unknown as jest.Mocked<SystemTimeService>;

    service = new LookerStudioConnectorApiService(
      {} as LookerStudioConnectorApiConfigService,
      {} as LookerStudioConnectorApiSchemaService,
      dataService,
      cacheService,
      reportService,
      consumptionTrackingService,
      eventDispatcher as any,
      reportRunService,
      projectBalanceService,
      blendedReportDataService,
      systemTimeService
    );

    (service as any).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockRequest = (sampleExtraction = false): GetDataRequest =>
    ({
      connectionConfig: {
        deploymentUrl: 'https://example.com',
        destinationId: 'dest-1',
        destinationSecretKey: 'secret',
      },
      request: {
        configParams: { destinationId: 'dest-1', reportId: 'report-1' },
        scriptParams: { sampleExtraction },
        fields: [{ name: 'field1' }],
      },
    }) as GetDataRequest;

  const createMockReport = (): Report =>
    ({
      id: 'report-1',
      dataMart: { id: 'datamart-1', projectId: 'project-1' },
      createdById: 'user-1',
    }) as unknown as Report;

  const createMockResponse = (): Partial<Response> => ({
    json: jest.fn(),
    setHeader: jest.fn().mockReturnThis(),
    write: jest.fn().mockReturnValue(true),
    end: jest.fn(),
    headersSent: false,
  });

  describe('getDataStreaming', () => {
    beforeEach(() => {
      const mockReport = createMockReport();
      const mockCachedReader = {
        fromCache: true,
        reader: {},
        dataDescription: { dataHeaders: [] },
      };

      reportService.getByIdAndLookerStudioSecret.mockResolvedValue(mockReport);
      cacheService.getOrCreateCachedReader.mockResolvedValue(mockCachedReader as any);
    });

    describe('sample extraction', () => {
      it('should use non-streaming for sample extraction regardless of feature flag', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(true);
        const res = createMockResponse();
        const mockResult = { schema: [], rows: [], filtersApplied: [] };

        dataService.getData.mockResolvedValue({
          response: mockResult,
          meta: {
            limitExceeded: false,
            rowsSent: 0,
            bytesSent: undefined,
            limitReason: undefined,
          },
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(res.json).toHaveBeenCalledWith(mockResult);
        expect(dataService.streamData).not.toHaveBeenCalled();
      });
    });

    describe('full extraction with streaming disabled (default)', () => {
      it('should use non-streaming when LOOKER_STREAMING_ENABLED is not set', async () => {
        delete process.env.LOOKER_STREAMING_ENABLED;
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockResult = { schema: [], rows: [], filtersApplied: [] };
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue({
          response: mockResult,
          meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(res.json).toHaveBeenCalledWith(mockResult);
        expect(dataService.streamData).not.toHaveBeenCalled();
      });

      it('should use non-streaming when LOOKER_STREAMING_ENABLED is false', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'false';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockResult = { schema: [], rows: [], filtersApplied: [] };
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue({
          response: mockResult,
          meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(res.json).toHaveBeenCalledWith(mockResult);
        expect(dataService.streamData).not.toHaveBeenCalled();
      });

      it('should not register consumption when data is from cache (non-streaming)', async () => {
        delete process.env.LOOKER_STREAMING_ENABLED;
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockResult = { schema: [], rows: [], filtersApplied: [] };
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue({
          response: mockResult,
          meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
        } as any);

        // beforeEach sets fromCache: true
        await service.getDataStreaming(request, res as Response);

        expect(mockReportRun.markAsSuccess).toHaveBeenCalled();
        expect(
          consumptionTrackingService.registerLookerReportRunConsumption
        ).not.toHaveBeenCalled();
        expect(eventDispatcher.publishExternal).toHaveBeenCalled();
      });

      it('should register consumption when data is not from cache (non-streaming)', async () => {
        delete process.env.LOOKER_STREAMING_ENABLED;
        cacheService.getOrCreateCachedReader.mockResolvedValue({
          fromCache: false,
          reader: {},
          dataDescription: { dataHeaders: [] },
        } as any);
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockResult = { schema: [], rows: [], filtersApplied: [] };
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue({
          response: mockResult,
          meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(mockReportRun.markAsSuccess).toHaveBeenCalled();
        expect(consumptionTrackingService.registerLookerReportRunConsumption).toHaveBeenCalled();
        expect(eventDispatcher.publishExternal).toHaveBeenCalled();
      });
    });

    describe('full extraction with streaming enabled', () => {
      it('should use streaming when LOOKER_STREAMING_ENABLED is true', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };
        const mockContext = { schema: [], fieldIndexMap: [], rowLimit: 1000000, reader: {} };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockResolvedValue(mockContext as any);
        dataService.streamData.mockResolvedValue({
          rowCount: 100,
          limitExceeded: false,
          bytesWritten: 10,
          limitReason: undefined,
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(dataService.prepareStreamingContext).toHaveBeenCalled();
        expect(dataService.streamData).toHaveBeenCalledWith(res, mockContext);
        expect(res.json).not.toHaveBeenCalled();
      });

      it('should not register consumption when data is from cache', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockResolvedValue({} as any);
        dataService.streamData.mockResolvedValue({
          rowCount: 100,
          limitExceeded: false,
          bytesWritten: 10,
          limitReason: undefined,
        } as any);

        // beforeEach sets fromCache: true
        await service.getDataStreaming(request, res as Response);

        expect(mockReportRun.markAsSuccess).toHaveBeenCalled();
        expect(reportRunService.finish).toHaveBeenCalled();
        expect(
          consumptionTrackingService.registerLookerReportRunConsumption
        ).not.toHaveBeenCalled();
        expect(eventDispatcher.publishExternal).toHaveBeenCalled();
      });

      it('should register consumption when data is not from cache', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        cacheService.getOrCreateCachedReader.mockResolvedValue({
          fromCache: false,
          reader: {},
          dataDescription: { dataHeaders: [] },
        } as any);
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockResolvedValue({} as any);
        dataService.streamData.mockResolvedValue({
          rowCount: 100,
          limitExceeded: false,
          bytesWritten: 10,
          limitReason: undefined,
        } as any);

        await service.getDataStreaming(request, res as Response);

        expect(mockReportRun.markAsSuccess).toHaveBeenCalled();
        expect(reportRunService.finish).toHaveBeenCalled();
        expect(consumptionTrackingService.registerLookerReportRunConsumption).toHaveBeenCalled();
        expect(eventDispatcher.publishExternal).toHaveBeenCalled();
      });

      it('should handle errors before streaming starts', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsUnsuccessful: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockRejectedValue(new Error('Preparation failed'));

        await expect(service.getDataStreaming(request, res as Response)).rejects.toThrow(
          'Preparation failed'
        );

        expect(mockReportRun.markAsUnsuccessful).toHaveBeenCalled();
      });
    });
  });

  describe('blended SQL logging', () => {
    const setupRun = (blendingDecision: unknown = { needsBlending: false }) => {
      const mockReport = createMockReport();
      const mockCachedReader = {
        fromCache: true,
        reader: {},
        dataDescription: { dataHeaders: [] },
        blendingDecision,
      };
      const mockReportRun = {
        markAsSuccess: jest.fn(),
        markAsUnsuccessful: jest.fn(),
        getReport: jest.fn().mockReturnValue(mockReport),
        getReportId: jest.fn().mockReturnValue('report-1'),
      };

      reportService.getByIdAndLookerStudioSecret.mockResolvedValue(mockReport);
      cacheService.getOrCreateCachedReader.mockResolvedValue(mockCachedReader as any);
      reportRunService.create.mockResolvedValue(mockReportRun as any);
      return { mockReport, mockReportRun };
    };

    it('forwards cached blending decision to logBlendedSqlIfNeeded on full extraction', async () => {
      const decision = {
        needsBlending: true,
        blendedSql: 'WITH cte AS (SELECT 1) SELECT * FROM cte',
      };
      setupRun(decision);

      dataService.getData.mockResolvedValue({
        response: { schema: [], rows: [], filtersApplied: [] },
        meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
      } as any);

      await service.getData(createMockRequest(false));

      expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
      expect(blendedReportDataService.logBlendedSqlIfNeeded).toHaveBeenCalledWith(
        decision,
        expect.objectContaining({ log: expect.any(Function), asArrays: expect.any(Function) })
      );
    });

    it('does not log blended SQL on sample extraction', async () => {
      setupRun({ needsBlending: true, blendedSql: 'SELECT 1' });

      dataService.getData.mockResolvedValue({
        response: { schema: [], rows: [], filtersApplied: [] },
        meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
      } as any);

      await service.getData(createMockRequest(true));

      expect(blendedReportDataService.logBlendedSqlIfNeeded).not.toHaveBeenCalled();
    });

    it('passes collected logs to finish when blending produced SQL', async () => {
      setupRun({ needsBlending: true, blendedSql: 'SELECT 1' });
      blendedReportDataService.logBlendedSqlIfNeeded.mockImplementation((decision, logger) => {
        if (decision?.needsBlending && decision.blendedSql && logger) {
          logger.log({ type: 'joined-data-marts-sql', sql: decision.blendedSql });
        }
      });

      dataService.getData.mockResolvedValue({
        response: { schema: [], rows: [], filtersApplied: [] },
        meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
      } as any);

      await service.getData(createMockRequest(false));

      expect(reportRunService.finish).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          logs: expect.arrayContaining([expect.stringContaining('"type":"joined-data-marts-sql"')]),
          errors: [],
        })
      );
    });

    it('still persists empty logs/errors when blending is not needed', async () => {
      setupRun({ needsBlending: false });

      dataService.getData.mockResolvedValue({
        response: { schema: [], rows: [], filtersApplied: [] },
        meta: { limitExceeded: false, rowsSent: 0, bytesSent: undefined, limitReason: undefined },
      } as any);

      await service.getData(createMockRequest(false));

      expect(blendedReportDataService.logBlendedSqlIfNeeded).toHaveBeenCalled();
      expect(reportRunService.finish).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ logs: [], errors: [] })
      );
    });
  });
});
