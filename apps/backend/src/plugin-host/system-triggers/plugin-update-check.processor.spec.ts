import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { Plugin } from '../entities/plugin.entity';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { RunPluginUpdateCheckService } from '../use-cases/run-plugin-update-check.service';
import { PluginUpdateCheckProcessor } from './plugin-update-check.processor';

const due = (id: string): Plugin => ({ id, repoOwner: 'OWOX', repoName: id }) as Plugin;

function setup(options: { due?: Plugin[]; maintained?: boolean } = {}) {
  const schedule = {
    listDue: jest.fn().mockResolvedValue(options.due ?? [due('p1')]),
    isUnderMaintenance: jest.fn().mockResolvedValue(options.maintained ?? true),
    reschedule: jest.fn().mockResolvedValue(undefined),
    dropFromSchedule: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginUpdateScheduleService>;

  const check = {
    run: jest.fn().mockResolvedValue({
      pluginId: 'p1',
      repository: 'OWOX/p1',
      outcome: 'up_to_date',
      currentVersionId: 'v1',
      currentSemver: '1.0.0',
      report: null,
    }),
  } as unknown as jest.Mocked<RunPluginUpdateCheckService>;

  return { processor: new PluginUpdateCheckProcessor(schedule, check), schedule, check };
}

const run = (s: ReturnType<typeof setup>, signal?: AbortSignal) =>
  s.processor.process({} as SystemTrigger, signal ? { signal } : undefined);

describe('PluginUpdateCheckProcessor', () => {
  it('checks a due plugin as the deployment, not as a member', async () => {
    const s = setup();

    await run(s);

    expect(s.check.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'automatic');
  });

  it('moves a checked plugin to its next slot', async () => {
    const s = setup();

    await run(s);

    expect(s.schedule.reschedule).toHaveBeenCalledWith('p1', expect.any(Date));
  });

  // A failed check waits for tomorrow rather than retrying against a GitHub that is
  // already refusing us; the outcome itself never throws.
  it('reschedules a plugin whose check failed', async () => {
    const s = setup();
    s.check.run.mockResolvedValue({
      pluginId: 'p1',
      repository: 'OWOX/p1',
      outcome: 'failed',
      currentVersionId: 'v1',
      currentSemver: '1.0.0',
      report: null,
    });

    await run(s);

    expect(s.schedule.reschedule).toHaveBeenCalled();
  });

  it('drops a plugin nothing publishes or installs, without spending a GitHub call', async () => {
    const s = setup({ maintained: false });

    await run(s);

    expect(s.schedule.dropFromSchedule).toHaveBeenCalledWith('p1');
    expect(s.check.run).not.toHaveBeenCalled();
  });

  it('stops the pass when the runner aborts', async () => {
    const s = setup({ due: [due('p1'), due('p2')] });
    const controller = new AbortController();
    controller.abort();

    await run(s, controller.signal);

    expect(s.check.run).not.toHaveBeenCalled();
  });
});
