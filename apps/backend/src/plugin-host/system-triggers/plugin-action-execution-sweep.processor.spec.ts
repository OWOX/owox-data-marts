import { Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';
import { PluginActionExecutionSweepProcessor } from './plugin-action-execution-sweep.processor';

const NOW = new Date('2026-10-14T12:00:00.000Z');

function setup(timedOut = 0) {
  const executions = {
    timeOutOrphans: jest.fn().mockResolvedValue(timedOut),
    clearPayloads: jest.fn().mockResolvedValue(0),
    deleteFinished: jest.fn().mockResolvedValue(0),
  };
  const processor = new PluginActionExecutionSweepProcessor(
    executions as unknown as PluginActionExecutionService
  );
  return { processor, executions };
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
});
