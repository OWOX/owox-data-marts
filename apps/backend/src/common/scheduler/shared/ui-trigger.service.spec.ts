import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TriggerStatus } from './entities/trigger-status';
import { UiTrigger } from './entities/ui-trigger.entity';
import { UiTriggerService } from './ui-trigger.service';

interface TestResponse {
  value: string;
}

/**
 * Concrete subclass to exercise the abstract base service.
 */
class TestUiTriggerService extends UiTriggerService<TestResponse> {
  constructor(repository: Repository<UiTrigger<TestResponse>>) {
    super(repository);
  }
}

describe('UiTriggerService tenant scoping', () => {
  const PROJECT = 'proj-1';
  const OTHER_PROJECT = 'proj-2';
  const USER = 'user-1';

  const createService = (overrides: Partial<UiTrigger<TestResponse>> = {}) => {
    const stored = {
      id: 'trigger-1',
      projectId: PROJECT,
      userId: USER,
      status: TriggerStatus.SUCCESS,
      uiResponse: { value: 'ok' },
      ...overrides,
    } as UiTrigger<TestResponse>;

    const repository = {
      // Mirror the real query: a trigger is only visible when both id and
      // projectId match, so cross-project lookups resolve to null.
      findOne: jest.fn(({ where }: { where: { id: string; projectId: string } }) => {
        if (stored.id === where.id && stored.projectId === where.projectId) {
          return Promise.resolve(stored);
        }
        return Promise.resolve(null);
      }),
      remove: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<UiTrigger<TestResponse>>;

    const service = new TestUiTriggerService(repository);
    return { service, repository, stored };
  };

  describe('getTriggerStatus', () => {
    it('returns the status for a trigger in the authenticated project', async () => {
      const { service } = createService({ status: TriggerStatus.PROCESSING });

      await expect(service.getTriggerStatus('trigger-1', PROJECT)).resolves.toBe(
        TriggerStatus.PROCESSING
      );
    });

    it('rejects a trigger from another project as not found', async () => {
      const { service } = createService();

      await expect(service.getTriggerStatus('trigger-1', OTHER_PROJECT)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getTriggerResponse', () => {
    it('returns and removes the response for a trigger in the authenticated project', async () => {
      const { service, repository, stored } = createService({ status: TriggerStatus.SUCCESS });

      await expect(service.getTriggerResponse('trigger-1', PROJECT)).resolves.toEqual({
        value: 'ok',
      });
      expect(repository.remove).toHaveBeenCalledWith(stored);
    });

    it('does not return or remove a trigger from another project', async () => {
      const { service, repository } = createService({ status: TriggerStatus.SUCCESS });

      await expect(service.getTriggerResponse('trigger-1', OTHER_PROJECT)).rejects.toThrow(
        NotFoundException
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('abortTriggerRun', () => {
    it('aborts a trigger owned by the user within the authenticated project', async () => {
      const { service, repository, stored } = createService({ status: TriggerStatus.IDLE });

      await service.abortTriggerRun('trigger-1', USER, PROJECT);

      expect(repository.remove).toHaveBeenCalledWith(stored);
    });

    it('does not abort a trigger from another project', async () => {
      const { service, repository } = createService({ status: TriggerStatus.IDLE });

      await expect(service.abortTriggerRun('trigger-1', USER, OTHER_PROJECT)).rejects.toThrow(
        NotFoundException
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('forbids aborting another user trigger even within the same project', async () => {
      const { service, repository } = createService({
        status: TriggerStatus.IDLE,
        userId: 'someone-else',
      });

      await expect(service.abortTriggerRun('trigger-1', USER, PROJECT)).rejects.toThrow(
        ForbiddenException
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('rejects aborting a processing trigger that cannot transition', async () => {
      const { service } = createService({ status: TriggerStatus.CANCELLED });

      await expect(service.abortTriggerRun('trigger-1', USER, PROJECT)).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
