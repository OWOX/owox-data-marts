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

  it('publishes one consumption command with the run id as processRunId', async () => {
    const service = buildService({
      CONSUMPTION_PUBSUB_PROJECT_ID: 'consumption-project',
      CONSUMPTION_HTTP_DATA_RUN_TOPIC: 'http-data-topic',
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
        processRunId: 'run-1',
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
    const service = buildService({ CONSUMPTION_HTTP_DATA_RUN_TOPIC: 'http-data-topic' });

    await expect(
      service.registerHttpDataRunConsumption(fakeDataMart(), 'run-1')
    ).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
    expect((PubSubService as unknown as jest.Mock).mock.calls).toHaveLength(0);
  });
});
