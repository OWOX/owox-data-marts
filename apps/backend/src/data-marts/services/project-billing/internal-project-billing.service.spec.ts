import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';
import { ConnectorService } from '../connector/connector.service';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { RunKind } from './project-billing.service';

const mockPublish = jest.fn();

jest.mock('../../../common/pubsub/pubsub.service', () => ({
  PubSubService: jest.fn().mockImplementation(() => ({
    publishMessageWithDefaultWrap: mockPublish,
  })),
}));

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: jest.fn().mockResolvedValue('id-token'),
  })),
}));

const fetchWithBackoffMock = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;

const BALANCE_ENV = {
  BALANCE_ENDPOINT_BASE_URL: 'https://balance.owox.test/',
  BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'balance@owox.test',
  BALANCE_ENDPOINT_TARGET_AUDIENCE: 'balance-audience',
};

const PUBSUB_ENV = {
  CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
  CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC: 'http-data-topic',
  CONSUMPTION_DATA_QUALITY_RUN_TOPIC: 'dq-topic',
  CONSUMPTION_CONNECTOR_RUN_TOPIC: 'connector-topic',
  CONSUMPTION_MCP_QUERY_RUN_TOPIC: 'mcp-topic',
  CONSUMPTION_SHEETS_REPORT_RUN_TOPIC: 'sheets-topic',
  CONSUMPTION_LOOKER_REPORT_RUN_TOPIC: 'looker-topic',
  CONSUMPTION_EXCEL_REPORT_RUN_TOPIC: 'excel-topic',
  CONSUMPTION_EMAIL_REPORT_RUN_TOPIC: 'email-topic',
  CONSUMPTION_SLACK_REPORT_RUN_TOPIC: 'slack-topic',
  CONSUMPTION_GOOGLE_CHAT_REPORT_RUN_TOPIC: 'google-chat-topic',
  CONSUMPTION_MS_TEAMS_REPORT_RUN_TOPIC: 'ms-teams-topic',
};

function fakeDataMart(): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    title: 'My DM',
    storage: { id: 'storage-1', title: 'BQ', type: 'GOOGLE_BIGQUERY' },
    definition: { connector: { source: { name: 'facebook-ads' } } },
  } as unknown as DataMart;
}

function fakeReport(destinationType: DataDestinationType): Report {
  return {
    id: 'report-1',
    title: 'My Report',
    dataMart: fakeDataMart(),
    dataDestination: { id: 'dest-1', title: 'Dest', type: destinationType },
    destinationConfig: { spreadsheetId: 'spreadsheet-1', sheetId: 'sheet-1' },
  } as unknown as Report;
}

function buildService(
  env: Record<string, string | undefined>,
  connectors: Array<{ name: string; title: string }> = []
): InternalProjectBillingService {
  const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
  const connectorService = {
    getAvailableConnectors: jest.fn().mockResolvedValue(connectors),
  } as unknown as ConnectorService;
  return new InternalProjectBillingService(configService, connectorService);
}

function balanceResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('InternalProjectBillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockReset();
  });

  describe('configuration', () => {
    it('reports the balance integration as unconfigured when no variable is set', () => {
      expect(buildService({}).isBalanceConfigured()).toBe(false);
    });

    it('reports the balance integration as configured when all variables are set', () => {
      expect(buildService(BALANCE_ENV).isBalanceConfigured()).toBe(true);
    });

    it('throws when the balance integration is only partially configured', () => {
      expect(() =>
        buildService({ BALANCE_ENDPOINT_BASE_URL: 'https://balance.owox.test' })
      ).toThrow('Balance service is partially configured');
    });

    it.each([
      'CONSUMPTION_PUBSUB_PROJECT_ID',
      'CONSUMPTION_SHEETS_REPORT_RUN_TOPIC',
      'CONSUMPTION_LOOKER_REPORT_RUN_TOPIC',
      'CONSUMPTION_EXCEL_REPORT_RUN_TOPIC',
      'CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC',
      'CONSUMPTION_MCP_QUERY_RUN_TOPIC',
      'CONSUMPTION_EMAIL_REPORT_RUN_TOPIC',
      'CONSUMPTION_SLACK_REPORT_RUN_TOPIC',
      'CONSUMPTION_GOOGLE_CHAT_REPORT_RUN_TOPIC',
      'CONSUMPTION_MS_TEAMS_REPORT_RUN_TOPIC',
    ])('rejects a license gateway missing %s', missingKey => {
      const service = buildService({ ...PUBSUB_ENV, ...BALANCE_ENV, [missingKey]: undefined });

      expect(() => service.assertForwardedConsumptionConfigured()).toThrow(missingKey);
    });
  });

  describe('verifyCanPerformOperations', () => {
    it('allows the run without calling the Balance API when unconfigured', async () => {
      const service = buildService({});

      await expect(service.verifyCanPerformOperations('proj-1')).resolves.toBeUndefined();
      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('allows the run when the Balance API allows the operation', async () => {
      fetchWithBackoffMock.mockResolvedValue(
        balanceResponse({ allowed: true, blockedReasons: [] })
      );
      const service = buildService(BALANCE_ENV);

      await service.verifyCanPerformOperations('proj-1');

      expect(fetchWithBackoffMock).toHaveBeenCalledWith(
        'https://balance.owox.test/proj-1/operation/can-perform',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('throws ProjectOperationBlockedException when the Balance API blocks the project', async () => {
      fetchWithBackoffMock.mockResolvedValue(
        balanceResponse({
          allowed: false,
          blockedReasons: [ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED],
        })
      );
      const service = buildService(BALANCE_ENV);

      await expect(service.verifyCanPerformOperations('proj-1')).rejects.toBeInstanceOf(
        ProjectOperationBlockedException
      );
    });

    it('propagates a Balance API transport failure', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('balance unreachable'));
      const service = buildService(BALANCE_ENV);

      await expect(service.verifyCanPerformOperations('proj-1')).rejects.toThrow(
        'balance unreachable'
      );
    });

    it('propagates a non-ok Balance API response', async () => {
      fetchWithBackoffMock.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      } as unknown as Response);
      const service = buildService(BALANCE_ENV);

      await expect(service.verifyCanPerformOperations('proj-1')).rejects.toThrow(
        'Balance API request failed with status 503'
      );
    });
  });

  describe('consumption registration', () => {
    it('publishes an HTTP Data run to its topic with the run id as reportRunId', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1');

      expect(mockPublish).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledWith(
        'http-data-topic',
        expect.objectContaining({
          projectId: 'proj-1',
          dataMartId: 'dm-1',
          dataMartTitle: 'My DM',
          dataStorageId: 'storage-1',
          dataStorageTitle: 'BQ',
          dataStorageType: 'GOOGLE_BIGQUERY',
          reportRunId: 'run-1',
        })
      );
    });

    it('publishes a Data Quality run to the dedicated topic, not the connector topic', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.registerDataQualityRunConsumption(fakeDataMart(), 'run-2');

      expect(mockPublish).toHaveBeenCalledWith(
        'dq-topic',
        expect.objectContaining({ processRunId: 'run-2' })
      );
    });

    it('publishes an MCP Query run with the run id', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.registerMcpQueryRunConsumption(fakeDataMart(), 'run-3');

      expect(mockPublish).toHaveBeenCalledWith(
        'mcp-topic',
        expect.objectContaining({ runId: 'run-3' })
      );
    });

    it('publishes an AI process run with token usage and its context', async () => {
      const service = buildService({
        ...PUBSUB_ENV,
        CONSUMPTION_AI_PROCESS_RUN_TOPIC: 'ai-topic',
      });

      await service.registerAiProcessRunConsumption(1234, {
        contextType: 'INSIGHT',
        contextId: 'insight-1',
        contextTitle: 'My Insight',
        dataMart: fakeDataMart(),
      });

      expect(mockPublish).toHaveBeenCalledWith(
        'ai-topic',
        expect.objectContaining({
          projectId: 'proj-1',
          tokensProcessed: 1234,
          contextType: 'INSIGHT',
          contextId: 'insight-1',
          contextTitle: 'My Insight',
          processRunId: expect.stringMatching(/^insight-1-\d+-[0-9a-f]{6}$/),
        })
      );
    });

    it('enriches a connector run with the human-readable connector title', async () => {
      const service = buildService(PUBSUB_ENV, [{ name: 'facebook-ads', title: 'Facebook Ads' }]);

      await service.registerConnectorRunConsumption(fakeDataMart(), 'run-4');

      expect(mockPublish).toHaveBeenCalledWith(
        'connector-topic',
        expect.objectContaining({ inputSource: 'Facebook Ads', processRunId: 'run-4' })
      );
    });

    it('falls back to the raw connector name when no title is registered', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.registerConnectorRunConsumption(fakeDataMart(), 'run-4');

      expect(mockPublish).toHaveBeenCalledWith(
        'connector-topic',
        expect.objectContaining({ inputSource: 'facebook-ads' })
      );
    });

    it('skips the connector catalog lookup when consumption tracking is not configured', async () => {
      const configService = { get: () => undefined } as unknown as ConfigService;
      const connectorService = {
        getAvailableConnectors: jest.fn(),
      } as unknown as ConnectorService;
      const service = new InternalProjectBillingService(configService, connectorService);

      await service.registerConnectorRunConsumption(fakeDataMart(), 'run-4');

      expect(connectorService.getAvailableConnectors).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('publishes a Google Sheets report run with document and list details', async () => {
      const service = buildService(PUBSUB_ENV);
      const report = fakeReport(DataDestinationType.GOOGLE_SHEETS);

      await service.registerSheetsReportRunConsumption(report, {
        googleSheetsDocumentTitle: 'Test Spreadsheet',
        googleSheetsListTitle: 'Sheet1',
      });

      expect(mockPublish).toHaveBeenCalledWith(
        'sheets-topic',
        expect.objectContaining({
          reportId: 'report-1',
          reportTitle: 'My Report',
          dataDestinationId: 'dest-1',
          dataDestinationType: DataDestinationType.GOOGLE_SHEETS,
          googleSheetsDocumentId: 'spreadsheet-1',
          googleSheetsDocumentTitle: 'Test Spreadsheet',
          googleSheetsListId: 'sheet-1',
          googleSheetsListTitle: 'Sheet1',
        })
      );
    });

    it('publishes a Looker report run to the Looker topic', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.registerLookerReportRunConsumption(
        fakeReport(DataDestinationType.LOOKER_STUDIO)
      );

      expect(mockPublish).toHaveBeenCalledWith(
        'looker-topic',
        expect.objectContaining({ reportId: 'report-1' })
      );
    });

    it('publishes an Excel report run to the Excel topic, keyed by the run it was charged for', async () => {
      // The run id is the DataMartRun's, not a synthesised one, so a consumption record and the
      // run in history can be matched afterwards.
      const service = buildService(PUBSUB_ENV);

      await service.registerExcelReportRunConsumption(
        fakeReport(DataDestinationType.EXCEL),
        'data-mart-run-1'
      );

      expect(mockPublish).toHaveBeenCalledWith(
        'excel-topic',
        expect.objectContaining({
          reportId: 'report-1',
          reportRunId: 'data-mart-run-1',
          dataDestinationType: DataDestinationType.EXCEL,
        })
      );
    });

    it.each([
      [DataDestinationType.EMAIL, 'email-topic'],
      [DataDestinationType.SLACK, 'slack-topic'],
      [DataDestinationType.GOOGLE_CHAT, 'google-chat-topic'],
      [DataDestinationType.MS_TEAMS, 'ms-teams-topic'],
    ])('routes an email-based %s report run to %s', async (destinationType, topic) => {
      const service = buildService(PUBSUB_ENV);

      await service.registerEmailBasedReportRunConsumption(fakeReport(destinationType));

      expect(mockPublish).toHaveBeenCalledWith(topic, expect.anything());
    });

    it('swallows an unsupported email-based destination type without publishing', async () => {
      const service = buildService(PUBSUB_ENV);

      await expect(
        service.registerEmailBasedReportRunConsumption(
          fakeReport(DataDestinationType.GOOGLE_SHEETS)
        )
      ).resolves.toBeUndefined();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('skips silently when the topic for that run kind is not configured', async () => {
      const service = buildService({ CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project' });

      await service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1');

      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('skips silently when PubSub is not configured at all', async () => {
      const service = buildService({ CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC: 'http-data-topic' });

      await expect(
        service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
      ).resolves.toBeUndefined();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('never propagates a publication failure to the caller', async () => {
      mockPublish.mockRejectedValue(new Error('pubsub unavailable'));
      const service = buildService(PUBSUB_ENV);

      await expect(
        service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('publishForwardedConsumption', () => {
    const licenseAttribution = {
      projectId: 'license-project',
      licenseKeyId: 'key-1',
      title: 'Production deployment',
      origin: 'https://customer.test',
    };

    it('bills to the license project and stamps the verified sender identity', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.publishForwardedConsumption(
        RunKind.HTTP_DATA_RUN,
        { projectId: 'caller-project', dataMartId: 'dm-1' },
        licenseAttribution
      );

      expect(mockPublish).toHaveBeenCalledWith(
        'http-data-topic',
        expect.objectContaining({
          projectId: 'license-project',
          selfManagedProjectId: 'caller-project',
          selfManagedLicenseKeyId: 'key-1',
          selfManagedLicenseTitle: 'Production deployment',
          selfManagedOrigin: 'https://customer.test',
          dataMartId: 'dm-1',
        })
      );
    });

    it('routes an email-based payload by its destination type', async () => {
      const service = buildService(PUBSUB_ENV);

      await service.publishForwardedConsumption(
        RunKind.EMAIL_BASED_REPORT_RUN,
        { dataDestinationType: DataDestinationType.SLACK },
        licenseAttribution
      );

      expect(mockPublish).toHaveBeenCalledWith('slack-topic', expect.anything());
    });

    it('rejects a forwarded record when its topic is not configured', async () => {
      const service = buildService({ CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project' });

      await expect(
        service.publishForwardedConsumption(
          RunKind.HTTP_DATA_RUN,
          { projectId: 'caller-project', dataMartId: 'dm-1' },
          licenseAttribution
        )
      ).rejects.toThrow('not configured');
    });

    it('propagates a forwarded PubSub publication failure', async () => {
      mockPublish.mockRejectedValue(new Error('pubsub unavailable'));
      const service = buildService(PUBSUB_ENV);

      await expect(
        service.publishForwardedConsumption(
          RunKind.HTTP_DATA_RUN,
          { projectId: 'caller-project', dataMartId: 'dm-1' },
          licenseAttribution
        )
      ).rejects.toThrow('pubsub unavailable');
    });
  });

  describe('getBalance', () => {
    it('returns the FREE zero balance when unconfigured', async () => {
      await expect(buildService({}).getBalance('proj-1')).resolves.toEqual({
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 0,
        consumedCredits: 0,
        creditUsagePercentage: 0,
      });
      expect(fetchWithBackoffMock).not.toHaveBeenCalled();
    });

    it('fetches and parses the balance from the Balance API', async () => {
      const balance = {
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 120,
        consumedCredits: 30,
        creditUsagePercentage: 20,
      };
      fetchWithBackoffMock.mockResolvedValue(balanceResponse(balance));

      await expect(buildService(BALANCE_ENV).getBalance('proj-1')).resolves.toEqual(balance);
      expect(fetchWithBackoffMock).toHaveBeenCalledWith(
        'https://balance.owox.test/proj-1/balance',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('propagates a Balance API failure', async () => {
      fetchWithBackoffMock.mockRejectedValue(new Error('balance unreachable'));

      await expect(buildService(BALANCE_ENV).getBalance('proj-1')).rejects.toThrow(
        'balance unreachable'
      );
    });
  });
});
