import { Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';
import { PluginActionQueueService } from '../services/plugin-action-queue.service';
import { PluginActionScheduleService } from '../services/plugin-action-schedule.service';
import { PluginActionExecutionSweepProcessor } from './plugin-action-execution-sweep.processor';

const NOW = new Date('2026-10-14T12:00:00.000Z');

function setup(timedOut = 0, queuedInstallations: string[] = []) {
  const executions = {
    timeOutOrphans: jest.fn().mockResolvedValue(timedOut),
    timeOutQueued: jest.fn().mockResolvedValue(0),
    findInstallationsWithQueued: jest.fn().mockResolvedValue(queuedInstallations),
    clearPayloads: jest.fn().mockResolvedValue(0),
    deleteFinished: jest.fn().mockResolvedValue(0),
  };
  const queue = { promote: jest.fn().mockResolvedValue(undefined) };
  const schedules = { unparkStranded: jest.fn().mockResolvedValue(0) };
  const processor = new PluginActionExecutionSweepProcessor(
    executions as unknown as PluginActionExecutionService,
    queue as unknown as PluginActionQueueService,
    schedules as unknown as PluginActionScheduleService,
    { queueSweepInstallations: 500 } as never
  );
  return { processor, executions, queue, schedules };
}

const signal = new AbortController().signal;
const run = (processor: PluginActionExecutionSweepProcessor) =>
  processor.process({} as SystemTrigger, { signal });

describe('PluginActionExecutionSweepProcessor', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs every minute as its own system trigger', () => {
    const { processor } = setup();

    expect(processor.getType()).toBe(SystemTriggerType.PLUGIN_ACTION_EXECUTION_SWEEP);
    expect(processor.getDefaultCron()).toBe('* * * * *');
  });

  it('times out executions still RUNNING a minute past their deadline', async () => {
    const { processor, executions } = setup();

    await run(processor);

    expect(executions.timeOutOrphans).toHaveBeenCalledWith(new Date('2026-10-14T11:59:00.000Z'));
  });

  it('times out runs queued for 24 hours before it promotes any', async () => {
    const { processor, executions } = setup(0, ['installation-1']);

    await run(processor);

    expect(executions.timeOutQueued).toHaveBeenCalledWith(new Date('2026-10-13T12:00:00.000Z'));
    expect(executions.timeOutQueued.mock.invocationCallOrder[0]).toBeLessThan(
      executions.findInstallationsWithQueued.mock.invocationCallOrder[0]
    );
  });

  it('promotes each installation with queued executions, one after another, after timing out orphans', async () => {
    const { processor, executions, queue } = setup(0, ['installation-1', 'installation-2']);
    const order: string[] = [];
    queue.promote.mockImplementation(async (installationId: string) => {
      order.push(`start ${installationId}`);
      await Promise.resolve();
      order.push(`end ${installationId}`);
    });

    await run(processor);

    expect(executions.findInstallationsWithQueued).toHaveBeenCalledTimes(1);
    expect(executions.findInstallationsWithQueued).toHaveBeenCalledWith(500, undefined);
    expect(executions.timeOutOrphans.mock.invocationCallOrder[0]).toBeLessThan(
      executions.findInstallationsWithQueued.mock.invocationCallOrder[0]
    );
    expect(order).toEqual([
      'start installation-1',
      'end installation-1',
      'start installation-2',
      'end installation-2',
    ]);
  });

  it('pages through every installation with queued executions, 500 at a time, until a short page', async () => {
    const page = Array.from({ length: 500 }, (_, index) => `installation-${1000 + index}`);
    const { processor, executions, queue } = setup();
    executions.findInstallationsWithQueued
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(['installation-2000']);

    await run(processor);

    expect(executions.findInstallationsWithQueued.mock.calls).toEqual([
      [500, undefined],
      [500, 'installation-1499'],
    ]);
    expect(queue.promote).toHaveBeenCalledTimes(501);
    expect(queue.promote).toHaveBeenLastCalledWith('installation-2000');
  });

  it('reads no further page once aborted, and still hands the signal to retention', async () => {
    const page = Array.from({ length: 500 }, (_, index) => `installation-${1000 + index}`);
    const { processor, executions, queue } = setup(0, page);
    const controller = new AbortController();
    queue.promote.mockImplementation(async () => controller.abort());

    await processor.process({} as SystemTrigger, { signal: controller.signal });

    expect(queue.promote).toHaveBeenCalledTimes(1);
    expect(executions.findInstallationsWithQueued).toHaveBeenCalledTimes(1);
    expect(executions.clearPayloads).toHaveBeenCalledWith(expect.any(Date), controller.signal);
    expect(executions.deleteFinished).toHaveBeenCalledWith(expect.any(Date), controller.signal);
  });

  it('stops promoting once aborted', async () => {
    const { processor, queue } = setup(0, ['installation-1', 'installation-2']);
    const controller = new AbortController();
    queue.promote.mockImplementation(async () => controller.abort());

    await processor.process({} as SystemTrigger, { signal: controller.signal });

    expect(queue.promote).toHaveBeenCalledTimes(1);
    expect(queue.promote).toHaveBeenCalledWith('installation-1');
  });

  it('gives stranded schedules their next slot every minute', async () => {
    const { processor, schedules } = setup();

    await run(processor);

    expect(schedules.unparkStranded).toHaveBeenCalledWith(NOW, 500);
  });

  it('promotes queued runs last, so the queue cannot hold back retention or unparking', async () => {
    const { processor, executions, schedules } = setup(0, ['installation-1']);

    await run(processor);

    const order = [
      executions.timeOutOrphans,
      executions.timeOutQueued,
      executions.clearPayloads,
      executions.deleteFinished,
      schedules.unparkStranded,
      executions.findInstallationsWithQueued,
    ].map(step => step.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('unparks stranded schedules after retention, so a failure there cannot stop it', async () => {
    const { processor, executions, schedules } = setup(2);
    schedules.unparkStranded.mockRejectedValueOnce(new Error('join failed'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(run(processor)).rejects.toThrow('join failed');

    expect(executions.clearPayloads).toHaveBeenCalled();
    expect(executions.deleteFinished).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('still promotes queued runs when a maintenance step fails, logs that step and rejects with its error', async () => {
    const { processor, executions, schedules, queue } = setup(0, ['installation-1']);
    const failure = new Error('join failed');
    schedules.unparkStranded.mockRejectedValueOnce(failure);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(run(processor)).rejects.toBe(failure);

    expect(executions.findInstallationsWithQueued).toHaveBeenCalled();
    expect(queue.promote).toHaveBeenCalledWith('installation-1');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Plugin action sweep step unparkStranded failed',
      failure.stack
    );
  });

  it('clears payloads a day after the execution finished, stopping when aborted', async () => {
    const { processor, executions } = setup();

    await run(processor);

    expect(executions.clearPayloads).toHaveBeenCalledWith(
      new Date('2026-10-13T12:00:00.000Z'),
      signal
    );
  });

  it('deletes rows ninety days after they finished, stopping when aborted', async () => {
    const { processor, executions } = setup();

    await run(processor);

    expect(executions.deleteFinished).toHaveBeenCalledWith(
      new Date('2026-07-16T12:00:00.000Z'),
      signal
    );
  });

  it('warns only when it timed something out', async () => {
    await run(setup(0).processor);
    expect(warn).not.toHaveBeenCalled();

    await run(setup(2).processor);
    expect(warn).toHaveBeenCalledWith(
      '2 plugin action executions outlived the replica that dispatched them and were marked TIMED_OUT'
    );
  });

  it('warns with the count when queued runs waited too long', async () => {
    const { processor, executions } = setup();
    executions.timeOutQueued.mockResolvedValueOnce(3);

    await run(processor);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '3 queued plugin action executions waited 24 hours and were marked TIMED_OUT'
    );
  });
});
