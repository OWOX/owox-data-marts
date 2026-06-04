import { In, Repository } from 'typeorm';
import { ReportRunTriggerService } from './report-run-trigger.service';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../../common/scheduler/shared/types';

describe('ReportRunTriggerService', () => {
  const createService = () => {
    const repository = {
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'trigger-1' })),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<ReportRunTrigger>;

    const service = new ReportRunTriggerService(repository);

    return { service, repository };
  };

  describe('createTrigger', () => {
    it('creates a trigger with correct fields', async () => {
      const { service, repository } = createService();

      const result = await service.createTrigger({
        reportId: 'report-1',
        projectId: 'proj-1',
        createdById: 'user-1',
        dataMartRunId: 'run-1',
        runType: RunType.manual,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: 'report-1',
          projectId: 'proj-1',
          createdById: 'user-1',
          dataMartRunId: 'run-1',
          runType: RunType.manual,
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result).toBe('trigger-1');
    });
  });

  describe('stopTriggersForRun', () => {
    it('cancels queued triggers and requests active trigger cancellation', async () => {
      const { service, repository } = createService();

      await service.stopTriggersForRun('run-1');

      expect(repository.update).toHaveBeenCalledWith(
        { dataMartRunId: 'run-1', status: In([TriggerStatus.IDLE, TriggerStatus.READY]) },
        { status: TriggerStatus.CANCELLED, isActive: false, version: expect.any(Function) }
      );
      expect(repository.update).toHaveBeenCalledWith(
        { dataMartRunId: 'run-1', status: TriggerStatus.PROCESSING },
        { status: TriggerStatus.CANCELLING, isActive: false, version: expect.any(Function) }
      );
    });
  });
});
