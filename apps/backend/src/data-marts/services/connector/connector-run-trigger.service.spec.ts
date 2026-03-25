import { Repository } from 'typeorm';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../../common/scheduler/shared/types';

describe('ConnectorRunTriggerService', () => {
  const createService = () => {
    const repository = {
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'trigger-1' })),
    } as unknown as Repository<ConnectorRunTrigger>;

    const service = new ConnectorRunTriggerService(repository);

    return { service, repository };
  };

  describe('createTrigger', () => {
    it('creates a trigger with correct fields', async () => {
      const { service, repository } = createService();

      const result = await service.createTrigger({
        dataMartId: 'dm-1',
        projectId: 'proj-1',
        createdById: 'user-1',
        dataMartRunId: 'run-1',
        runType: RunType.manual,
        payload: { key: 'value' },
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          createdById: 'user-1',
          dataMartRunId: 'run-1',
          runType: RunType.manual,
          payload: { key: 'value' },
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result).toBe('trigger-1');
    });

    it('sets payload to null when not provided', async () => {
      const { service, repository } = createService();

      await service.createTrigger({
        dataMartId: 'dm-1',
        projectId: 'proj-1',
        createdById: 'user-1',
        dataMartRunId: 'run-1',
        runType: RunType.manual,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: null,
        })
      );
    });
  });
});
