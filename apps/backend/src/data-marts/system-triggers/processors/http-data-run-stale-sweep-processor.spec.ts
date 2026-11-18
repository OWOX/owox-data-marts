import { Logger } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { DataMartRunService } from '../../services/data-mart-run.service';
import { HttpDataRunStaleSweepProcessor } from './http-data-run-stale-sweep-processor';

function setup() {
  const runs = { interruptStaleHttpDataRuns: jest.fn().mockResolvedValue(0) };
  const clock = { now: jest.fn().mockReturnValue(new Date('2026-05-29T12:00:00.000Z')) };
  const processor = new HttpDataRunStaleSweepProcessor(
    runs as unknown as DataMartRunService,
    clock as unknown as SystemTimeService
  );
  return { processor, runs };
}

describe('HttpDataRunStaleSweepProcessor', () => {
  it('reports its type and cron', () => {
    const { processor } = setup();
    expect(processor.getType()).toBe(SystemTriggerType.HTTP_DATA_RUN_STALE_SWEEP);
    expect(processor.getDefaultCron()).toBe('0 */15 * * * *');
  });

  it('interrupts runs that started more than 24 hours ago', async () => {
    const { processor, runs } = setup();
    await processor.process({} as SystemTrigger, { signal: new AbortController().signal });
    expect(runs.interruptStaleHttpDataRuns).toHaveBeenCalledWith(
      new Date('2026-05-28T12:00:00.000Z')
    );
  });

  it('logs the count only when runs were interrupted', async () => {
    const { processor, runs } = setup();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      runs.interruptStaleHttpDataRuns.mockResolvedValueOnce(2);
      await processor.process({} as SystemTrigger);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Interrupted 2 stale HTTP Data runs');

      log.mockClear();
      runs.interruptStaleHttpDataRuns.mockResolvedValueOnce(0);
      await processor.process({} as SystemTrigger);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('does nothing when the signal is aborted', async () => {
    const { processor, runs } = setup();
    const controller = new AbortController();
    controller.abort();
    await processor.process({} as SystemTrigger, { signal: controller.signal });
    expect(runs.interruptStaleHttpDataRuns).not.toHaveBeenCalled();
  });
});
