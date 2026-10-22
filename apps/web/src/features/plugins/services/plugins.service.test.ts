import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import apiClient from '../../../app/api/apiClient';
import { pluginsService } from './plugins.service';

vi.mock('../../../app/api/apiClient', () => ({
  default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));

describe('PluginsService.install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { installationId: 'installation-1' } });
  });

  it('omits empty Credential selections for compatibility with the previous backend', async () => {
    await pluginsService.install('plugin-1', 'version-1', {});

    expect(apiClient.post).toHaveBeenCalledWith(
      '/plugins/plugin-1/installation',
      {
        expectedVersionId: 'version-1',
      },
      undefined
    );
  });

  it('sends explicit Credential decisions when the plugin declares requirements', async () => {
    await pluginsService.install('plugin-1', 'version-1', { github: null });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/plugins/plugin-1/installation',
      {
        expectedVersionId: 'version-1',
        credentialSelections: { github: null },
      },
      undefined
    );
  });
});

describe('PluginsService.lookupByRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { pluginId: 'p1' } });
  });

  it("skips the global error toast, so a failed lookup shows only the page's own message", async () => {
    await pluginsService.lookupByRepository('OWOX/odm-usage-stat');

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/lookup', {
      params: { repository: 'OWOX/odm-usage-stat' },
      skipErrorToast: true,
    });
  });
});

describe('PluginsService.getHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], nextCursor: null } });
  });

  it('asks for the first page of one filter', async () => {
    await pluginsService.getHistory('publications');

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/history', {
      params: { type: 'publications' },
    });
  });

  it('passes the cursor for a later page', async () => {
    await pluginsService.getHistory('all', 'event-9');

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/history', {
      params: { type: 'all', cursor: 'event-9' },
    });
  });
});

describe('PluginsService schedules', () => {
  const schedule = { id: 's1', enabled: true };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [schedule], total: 1 } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: schedule });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
  });

  it('lists the schedules of one installation and unwraps the page', async () => {
    await expect(pluginsService.listSchedules('i1')).resolves.toEqual([schedule]);

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/schedules', {
      params: { offset: 0, installationId: 'i1' },
      skipErrorToast: true,
    });
  });

  it('reads the whole project a page at a time until the total', async () => {
    const second = { id: 's2', enabled: false };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { items: [schedule], total: 2 } })
      .mockResolvedValueOnce({ data: { items: [second], total: 2 } });

    await expect(pluginsService.listSchedules()).resolves.toEqual([schedule, second]);

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/plugins/schedules', {
      params: { offset: 0 },
      skipErrorToast: true,
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/plugins/schedules', {
      params: { offset: 1 },
      skipErrorToast: true,
    });
  });

  it('requests the remaining pages together once the first gives the total', async () => {
    const rows = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `s${from + index}` }));
    const resolvers: ((value: unknown) => void)[] = [];
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { items: rows(0, 100), total: 250 } })
      .mockImplementation(
        () =>
          new Promise(resolve => {
            resolvers.push(value => {
              resolve({ data: value });
            });
          })
      );

    const listed = pluginsService.listSchedules('i1');

    await vi.waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(3);
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/plugins/schedules', {
      params: { offset: 100, installationId: 'i1' },
      skipErrorToast: true,
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/plugins/schedules', {
      params: { offset: 200, installationId: 'i1' },
      skipErrorToast: true,
    });
    // The second page overlaps the first by one row, as a shifted list would.
    resolvers[0]({ items: rows(99, 101), total: 250 });
    resolvers[1]({ items: rows(200, 50), total: 250 });
    const all = await listed;
    expect(all).toHaveLength(250);
    expect(new Set(all.map(item => item.id)).size).toBe(250);
  });

  it('drops a row a shifted page repeats, and keeps paging by what it read', async () => {
    const second = { id: 's2', enabled: false };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { items: [schedule, second], total: 3 } })
      .mockResolvedValueOnce({ data: { items: [second], total: 3 } });

    await expect(pluginsService.listSchedules()).resolves.toEqual([schedule, second]);

    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/plugins/schedules', {
      params: { offset: 2 },
      skipErrorToast: true,
    });
  });

  it('stops at an empty page, even short of the total', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { items: [], total: 3 } });

    await expect(pluginsService.listSchedules()).resolves.toEqual([]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it.each(['pause', 'resume'] as const)(
    'posts %s by schedule id and leaves the refusal to the caller instead of the global toast',
    async verb => {
      await expect(pluginsService[`${verb}Schedule`]('s1')).resolves.toEqual(schedule);

      expect(apiClient.post).toHaveBeenCalledWith(`/plugins/schedules/s1/${verb}`, undefined, {
        skipErrorToast: true,
      });
    }
  );

  it('deletes a schedule by id', async () => {
    await pluginsService.deleteSchedule('s1');

    expect(apiClient.delete).toHaveBeenCalledWith('/plugins/schedules/s1', {
      skipErrorToast: true,
    });
  });
});

describe('PluginsService runs', () => {
  const page = { items: [], nextCursor: null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: page });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'r1' } });
  });

  const sentUrl = () => {
    const [url, config] = vi.mocked(apiClient.get).mock.calls[0];
    return axios.getUri({ ...config, url });
  };

  it('sends repeated status keys, which the API requires, and no bracketed form', async () => {
    await expect(
      pluginsService.listRuns(
        { statuses: ['FAILED', 'TIMED_OUT'], trigger: 'schedule' },
        'cursor-1'
      )
    ).resolves.toEqual(page);

    expect(sentUrl()).toBe(
      '/plugins/runs?status=FAILED&status=TIMED_OUT&trigger=schedule&cursor=cursor-1'
    );
    expect(vi.mocked(apiClient.get).mock.calls[0][1]).toMatchObject({ skipErrorToast: true });
  });

  it('sends no status key for no status and no cursor for the first page', async () => {
    await pluginsService.listRuns({ statuses: [], userId: 'u1' });

    expect(sentUrl()).toBe('/plugins/runs?userId=u1');
  });

  it('reads and cancels one run, leaving errors to the caller', async () => {
    await pluginsService.getRun('r1');
    await pluginsService.cancelRun('r1');

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/runs/r1', {
      params: undefined,
      skipErrorToast: true,
    });
    expect(apiClient.post).toHaveBeenCalledWith('/plugins/runs/r1/cancel', undefined, {
      skipErrorToast: true,
    });
  });
});
