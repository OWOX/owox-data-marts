import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { OwoxStorageLifecycleProcessor } from './owox-storage-lifecycle.processor';

describe('OwoxStorageLifecycleProcessor', () => {
  const make = (enabled: boolean) => {
    const lifecycle = { runDaily: jest.fn().mockResolvedValue(undefined) };
    const processor = new OwoxStorageLifecycleProcessor(
      lifecycle as never,
      {
        isEnabled: () => enabled,
      } as never
    );
    return { processor, lifecycle };
  };

  it('has its type and a 03:00 daily cron', () => {
    const { processor } = make(true);
    expect(processor.getType()).toBe(SystemTriggerType.OWOX_STORAGE_LIFECYCLE);
    expect(processor.getDefaultCron()).toBe('0 0 3 * * *');
  });

  it('is enabled only when OWOX Storage is configured', () => {
    expect(make(true).processor.isEnabled()).toBe(true);
    expect(make(false).processor.isEnabled()).toBe(false);
  });

  it('runs the daily pass with the signal', async () => {
    const { processor, lifecycle } = make(true);
    const signal = new AbortController().signal;
    await processor.process({} as never, { signal });
    expect(lifecycle.runDaily).toHaveBeenCalledWith(expect.any(Date), signal);
  });
});
