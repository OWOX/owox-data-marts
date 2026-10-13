import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast };
});
vi.mock('../services/plugins.service', () => ({
  pluginsService: { getHistory: vi.fn() },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../services/plugins.service';
import type { PluginHistoryEvent } from '../types';
import { usePluginHistory } from './usePluginHistory';

const item = (id: string): PluginHistoryEvent => ({
  id,
  occurredAt: '2026-10-01T10:00:00.000Z',
  action: 'install',
  scope: null,
  plugin: { pluginId: 'p1', displayName: 'Dashboards', ownerName: 'acme' },
  actor: { kind: 'you' },
  version: null,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePluginHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins pages and loads the next one from the cursor', async () => {
    vi.mocked(pluginsService.getHistory)
      .mockResolvedValueOnce({ items: [item('e1'), item('e2')], nextCursor: 'e2' })
      .mockResolvedValueOnce({ items: [item('e3')], nextCursor: null });

    const { result } = renderHook(() => usePluginHistory('all'), { wrapper });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.events.map(event => event.id)).toEqual(['e1', 'e2', 'e3']);
    });
    expect(result.current.hasMore).toBe(false);
    expect(pluginsService.getHistory).toHaveBeenLastCalledWith('all', 'e2');
  });

  it('says what failed when the history does not load', async () => {
    vi.mocked(pluginsService.getHistory).mockRejectedValue({
      response: { data: { message: 'History is unavailable' } },
    });

    renderHook(() => usePluginHistory('installations'), { wrapper });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('History is unavailable');
    });
  });
});
