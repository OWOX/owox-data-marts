import { ConfigService } from '@nestjs/config';
import { PubSubService } from '../../common/pubsub/pubsub.service';
import { ConnectorService } from './connector/connector.service';
import { ConsumptionTrackingService } from './consumption-tracking.service';
import { DataMart } from '../entities/data-mart.entity';

const mockPublish = jest.fn();

jest.mock('../../common/pubsub/pubsub.service', () => ({
  PubSubService: jest.fn().mockImplementation(() => ({
    publishMessageWithDefaultWrap: mockPublish,
  })),
}));

function fakeDataMart(): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    title: 'My DM',
    storage: { id: 'storage-1', title: 'BQ', type: 'GOOGLE_BIGQUERY' },
  } as unknown as DataMart;
}

function buildService(env: Record<string, string | undefined>): ConsumptionTrackingService {
  const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
  const connectorService = {} as unknown as ConnectorService;
  return new ConsumptionTrackingService(connectorService, configService);
}

describe('ConsumptionTrackingService.registerHttpDataRunConsumption', () => {
  beforeEach(() => {
    mockPublish.mockReset();
    (PubSubService as unknown as jest.Mock).mockClear();
  });

  it('publishes one consumption command with the run id as reportRunId', async () => {
    const service = buildService({
      CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
      CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC: 'http-data-topic',
    });

    await service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1');

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      'http-data-topic',
      expect.objectContaining({
        projectId: 'proj-1',
        dataMartId: 'dm-1',
        dataStorageId: 'storage-1',
        dataStorageType: 'GOOGLE_BIGQUERY',
        reportRunId: 'run-1',
      })
    );
  });

  it('skips silently when the HTTP Data topic is not configured', async () => {
    const service = buildService({ CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project' });

    await expect(
      service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
    ).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('skips silently when PubSub is not configured', async () => {
    const service = buildService({ CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC: 'http-data-topic' });

    await expect(
      service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
    ).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
    expect((PubSubService as unknown as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('ConsumptionTrackingService.registerDataQualityRunConsumption', () => {
  beforeEach(() => {
    mockPublish.mockReset();
    (PubSubService as unknown as jest.Mock).mockClear();
  });

  it('publishes one stable process-run command after a DQ run starts', async () => {
    mockPublish.mockResolvedValue('message-1');
    const service = buildService({
      CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
      CONSUMPTION_CONNECTOR_RUN_TOPIC: 'process-run-topic',
    });
    const startedAt = new Date('2026-07-15T10:15:30.000Z');

    await expect(
      service.registerDataQualityRunConsumption(fakeDataMart(), 'dq-run-1', startedAt)
    ).resolves.toBe('PUBLISHED');

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      'process-run-topic',
      expect.objectContaining({
        projectId: 'proj-1',
        dataMartId: 'dm-1',
        dataStorageId: 'storage-1',
        dataStorageType: 'GOOGLE_BIGQUERY',
        inputSource: 'Data Quality',
        processRunId: 'dq-run-1',
        runTime: '2026-07-15T10:15:30.000Z',
      })
    );
  });

  it('returns DISABLED without publishing in self-managed mode', async () => {
    const service = buildService({});

    await expect(
      service.registerDataQualityRunConsumption(
        fakeDataMart(),
        'dq-run-1',
        new Date('2026-07-15T10:15:30.000Z')
      )
    ).resolves.toBe('DISABLED');

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('propagates configured publication failures so the run can retry before SQL', async () => {
    mockPublish.mockRejectedValue(new Error('pubsub unavailable'));
    const service = buildService({
      CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
      CONSUMPTION_CONNECTOR_RUN_TOPIC: 'process-run-topic',
    });

    await expect(
      service.registerDataQualityRunConsumption(
        fakeDataMart(),
        'dq-run-1',
        new Date('2026-07-15T10:15:30.000Z')
      )
    ).rejects.toThrow('pubsub unavailable');
  });

  it('uses processRunId as a stable idempotency key across crash retries', async () => {
    mockPublish.mockResolvedValue('message-1');
    const service = buildService({
      CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
      CONSUMPTION_CONNECTOR_RUN_TOPIC: 'process-run-topic',
    });
    const startedAt = new Date('2026-07-15T10:15:30.000Z');

    await service.registerDataQualityRunConsumption(fakeDataMart(), 'dq-run-1', startedAt);
    await service.registerDataQualityRunConsumption(fakeDataMart(), 'dq-run-1', startedAt);

    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish.mock.calls[0][1]).toEqual(mockPublish.mock.calls[1][1]);
    expect(mockPublish.mock.calls[0][1]).toMatchObject({
      processRunId: 'dq-run-1',
      runTime: '2026-07-15T10:15:30.000Z',
    });
  });
});
