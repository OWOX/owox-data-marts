/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { GetDataRequest } from '../schemas/get-data.schema';
import { Report } from '../../../entities/report.entity';

// Mock external modules before importing service
jest.mock('@owox/internal-helpers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  OwoxProducer: class {},
  createProducer: jest.fn(),
  BaseEvent: class {
    constructor(public payload: unknown) {}
  },
}));

// Import after mocking
import { LookerStudioConnectorApiService } from './looker-studio-connector-api.service';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { ReportDataCacheService } from '../../../services/report-data-cache.service';
import { ReportService } from '../../../services/report.service';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import { LookerStudioReportRunService } from '../../../services/looker-studio-report-run.service';

describe('LookerStudioConnectorApiService', () => {
  let service: LookerStudioConnectorApiService;
  let dataService: jest.Mocked<LookerStudioConnectorApiDataService>;
  let cacheService: jest.Mocked<ReportDataCacheService>;
  let reportService: jest.Mocked<ReportService>;
  let reportRunService: jest.Mocked<LookerStudioReportRunService>;
  let consumptionTrackingService: jest.Mocked<ConsumptionTrackingService>;
  let producer: jest.Mocked<{ produceEvent: jest.Mock }>;

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

    producer = {
      produceEvent: jest.fn(),
    };

    service = new LookerStudioConnectorApiService(
      {} as LookerStudioConnectorApiConfigService,
      {} as LookerStudioConnectorApiSchemaService,
      dataService,
      cacheService,
      reportService,
      consumptionTrackingService,
      producer as any,
      reportRunService
    );
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

        dataService.getData.mockResolvedValue(mockResult);

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
          markAsFailed: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue(mockResult);

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
          markAsFailed: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.getData.mockResolvedValue(mockResult);

        await service.getDataStreaming(request, res as Response);

        expect(res.json).toHaveBeenCalledWith(mockResult);
        expect(dataService.streamData).not.toHaveBeenCalled();
      });
    });

    describe('full extraction with streaming enabled', () => {
      it('should use streaming when LOOKER_STREAMING_ENABLED is true', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsFailed: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };
        const mockContext = { schema: [], fieldIndexMap: [], rowLimit: 1000000, reader: {} };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockResolvedValue(mockContext as any);
        dataService.streamData.mockResolvedValue(100);

        await service.getDataStreaming(request, res as Response);

        expect(dataService.prepareStreamingContext).toHaveBeenCalled();
        expect(dataService.streamData).toHaveBeenCalledWith(res, mockContext);
        expect(res.json).not.toHaveBeenCalled();
      });

      it('should track report run on successful streaming', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsFailed: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockResolvedValue({} as any);
        dataService.streamData.mockResolvedValue(100);

        await service.getDataStreaming(request, res as Response);

        expect(mockReportRun.markAsSuccess).toHaveBeenCalled();
        expect(reportRunService.finish).toHaveBeenCalled();
        expect(consumptionTrackingService.registerLookerReportRunConsumption).toHaveBeenCalled();
        expect(producer.produceEvent).toHaveBeenCalled();
      });

      it('should handle errors before streaming starts', async () => {
        process.env.LOOKER_STREAMING_ENABLED = 'true';
        const request = createMockRequest(false);
        const res = createMockResponse();
        const mockReportRun = {
          markAsSuccess: jest.fn(),
          markAsFailed: jest.fn(),
          getReport: jest.fn().mockReturnValue(createMockReport()),
          getReportId: jest.fn().mockReturnValue('report-1'),
        };

        reportRunService.create.mockResolvedValue(mockReportRun as any);
        dataService.prepareStreamingContext.mockRejectedValue(new Error('Preparation failed'));

        await expect(service.getDataStreaming(request, res as Response)).rejects.toThrow(
          'Preparation failed'
        );

        expect(mockReportRun.markAsFailed).toHaveBeenCalled();
      });
    });
  });
});
