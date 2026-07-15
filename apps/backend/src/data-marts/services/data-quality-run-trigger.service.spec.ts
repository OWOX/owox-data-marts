import { EntityManager, Repository } from 'typeorm';
import { RunType } from '../../common/scheduler/shared/types';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataQualityRunTriggerService } from './data-quality-run-trigger.service';

describe('DataQualityRunTriggerService', () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<DataQualityRunTrigger>>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates one active persisted trigger for the run', async () => {
    const trigger = { id: 'trigger-1' } as DataQualityRunTrigger;
    repository.create.mockReturnValue(trigger);
    repository.save.mockResolvedValue(trigger);
    const service = new DataQualityRunTriggerService(repository);

    await expect(
      service.createTrigger({
        createdById: 'user-1',
        projectId: 'project-1',
        dataMartRunId: 'run-1',
        runType: RunType.manual,
      })
    ).resolves.toBe('trigger-1');

    expect(repository.create).toHaveBeenCalledWith({
      createdById: 'user-1',
      projectId: 'project-1',
      dataMartRunId: 'run-1',
      runType: RunType.manual,
      isActive: true,
      status: TriggerStatus.IDLE,
    });
  });

  it('uses the transaction manager repository when one is provided', async () => {
    const trigger = { id: 'trigger-2' } as DataQualityRunTrigger;
    const transactionalRepository = {
      create: jest.fn().mockReturnValue(trigger),
      save: jest.fn().mockResolvedValue(trigger),
    } as unknown as Repository<DataQualityRunTrigger>;
    const manager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    } as unknown as EntityManager;
    const service = new DataQualityRunTriggerService(repository);

    await expect(
      service.createTrigger(
        {
          createdById: 'user-1',
          projectId: 'project-1',
          dataMartRunId: 'run-2',
          runType: RunType.manual,
        },
        manager
      )
    ).resolves.toBe('trigger-2');

    expect(manager.getRepository).toHaveBeenCalledWith(DataQualityRunTrigger);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
