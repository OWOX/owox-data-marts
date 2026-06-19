import { In } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { stopRunTriggersForRun } from './run-trigger-cancellation';

describe('stopRunTriggersForRun', () => {
  it('cancels queued triggers and requests active trigger cancellation', async () => {
    const repository = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    await stopRunTriggersForRun(repository, 'run-1');

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
