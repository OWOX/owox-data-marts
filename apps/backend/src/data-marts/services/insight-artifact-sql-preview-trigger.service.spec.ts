import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { InsightArtifactSqlPreviewRequestedEvent } from '../events/insight-artifact-sql-preview-requested.event';
import { InsightArtifactSqlPreviewTriggerService } from './insight-artifact-sql-preview-trigger.service';

describe('InsightArtifactSqlPreviewTriggerService', () => {
  const createService = () => {
    const repository = {
      save: jest.fn(),
    };
    const producer = {
      produceEvent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InsightArtifactSqlPreviewTriggerService(
      repository as never,
      producer as never
    );

    return {
      service,
      repository,
      producer,
    };
  };

  it('creates trigger and emits sql_preview_requested event', async () => {
    const { service, repository, producer } = createService();
    repository.save.mockImplementation(async trigger => ({
      ...trigger,
      id: 'trigger-1',
    }));

    const triggerId = await service.createTrigger(
      'user-1',
      'project-1',
      'data-mart-1',
      'artifact-1',
      'select 1'
    );

    expect(triggerId).toBe('trigger-1');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        dataMartId: 'data-mart-1',
        insightArtifactId: 'artifact-1',
        sql: 'select 1',
        status: TriggerStatus.IDLE,
        isActive: true,
      })
    );
    expect(producer.produceEvent).toHaveBeenCalledTimes(1);
    const [event] = producer.produceEvent.mock.calls[0];
    expect(event).toBeInstanceOf(InsightArtifactSqlPreviewRequestedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      insightArtifactId: 'artifact-1',
      triggerId: 'trigger-1',
    });
  });
});
