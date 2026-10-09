import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdmin = vi.fn();

vi.mock('../../idp/hooks/useRole', () => ({ useIsAdmin: () => isAdmin() }));
vi.mock('../../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../services/plugins.service', () => ({
  pluginsService: {
    listPublications: vi.fn(),
    getInstallations: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../services/plugins.service';
import {
  usePluginPublishing,
  usePublishableScopes,
  type PublishFailure,
} from './usePluginPublications';

const publish = vi.mocked(pluginsService.publish);
const getInstallations = vi.mocked(pluginsService.getInstallations);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePublishableScopes', () => {
  beforeEach(() => vi.clearAllMocks());

  // Member scope is open to everyone: that is what lets people use plugins without
  // waiting on an admin, and §8.3 grants it to any project member.
  it('offers personal publishing to any member', () => {
    isAdmin.mockReturnValue(false);

    const { result } = renderHook(() => usePublishableScopes());

    expect(result.current).toEqual(['member']);
  });

  it('adds project publishing for an admin', () => {
    isAdmin.mockReturnValue(true);

    const { result } = renderHook(() => usePublishableScopes());

    expect(result.current).toEqual(['project', 'member']);
  });

  // Deployment scope is gated on an API key allowlist with no browser equivalent, so
  // offering it here could only ever produce a refusal.
  it('never offers deployment scope from the browser', () => {
    isAdmin.mockReturnValue(true);

    const { result } = renderHook(() => usePublishableScopes());

    expect(result.current).not.toContain('deployment');
  });
});

describe('usePluginPublishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publish.mockResolvedValue({ publicationId: 'pub1', pluginId: 'p1' } as never);
    getInstallations.mockResolvedValue([]);
  });

  it('reports success as no failure at all', async () => {
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    const captured: { failure?: PublishFailure | null } = {};
    await act(async () => {
      captured.failure = await result.current.publish('OWOX/example', 'member');
    });

    expect(captured.failure).toBeNull();
    expect(publish).toHaveBeenCalledWith({ repository: 'OWOX/example', scope: 'member' });
  });

  it('confirms a first publish plainly', async () => {
    getInstallations.mockResolvedValue([{ pluginId: 'other', displayName: 'Other' }] as never);
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    await act(async () => {
      await result.current.publish('OWOX/example', 'member');
    });

    expect(getInstallations).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Plugin published');
  });

  // Republishing a plugin the member already has succeeds silently on the server, so
  // "published" alone left them unsure whether anything had been installed.
  it('says so when the member already has the plugin installed', async () => {
    getInstallations.mockResolvedValue([{ pluginId: 'p1', displayName: 'Run History' }] as never);
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    await act(async () => {
      await result.current.publish('OWOX/example', 'member');
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Plugin published. You already have Run History installed.'
    );
  });

  // The publication already succeeded; a failed lookup must not turn it into a failure.
  it('still reports success when the installations cannot be read', async () => {
    getInstallations.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    const captured: { failure?: PublishFailure | null } = {};
    await act(async () => {
      captured.failure = await result.current.publish('OWOX/example', 'member');
    });

    expect(captured.failure).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Plugin published');
  });

  // The one publishing failure a member can resolve themselves, and the server hands
  // back exactly where to go. Losing that link would leave them stuck.
  it('surfaces the app installation url when the repository is unreadable', async () => {
    publish.mockRejectedValue({
      response: {
        data: {
          code: 'GITHUB_REPO_NOT_ACCESSIBLE',
          message: 'OWOX cannot read OWOX/example',
          errorDetails: { installationUrl: 'https://github.com/apps/owox/installations/new' },
        },
      },
    });
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    const captured: { failure?: PublishFailure | null } = {};
    await act(async () => {
      captured.failure = await result.current.publish('OWOX/example', 'member');
    });

    expect(captured.failure?.installationUrl).toBe(
      'https://github.com/apps/owox/installations/new'
    );
  });

  it('offers no link for a failure the member cannot fix', async () => {
    publish.mockRejectedValue({
      response: { data: { code: 'PLUGIN_PUBLICATION_FORBIDDEN', message: 'Not allowed' } },
    });
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    const captured: { failure?: PublishFailure | null } = {};
    await act(async () => {
      captured.failure = await result.current.publish('OWOX/example', 'project');
    });

    expect(captured.failure?.installationUrl).toBeUndefined();
    expect(captured.failure?.message).toBe('Not allowed');
  });

  // Members read Unpublish as Uninstall and then wonder why the plugin is still in their
  // menu, so the confirmation says what stayed.
  it('says that unpublishing uninstalls nobody', async () => {
    vi.mocked(pluginsService.unpublish).mockResolvedValue(undefined as never);
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    await act(async () => {
      await result.current.unpublish('OWOX/example', 'member');
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Plugin unpublished. Anyone who installed it keeps it until they uninstall it.'
    );
  });

  // Sharing withdraws the personal listing as a step; "unpublished" would say the opposite.
  it('says nothing when the withdrawal is a step of something else', async () => {
    vi.mocked(pluginsService.unpublish).mockResolvedValue(undefined as never);
    const { result } = renderHook(() => usePluginPublishing(), { wrapper });

    await act(async () => {
      await result.current.unpublish('OWOX/example', 'member', { silent: true });
    });

    expect(pluginsService.unpublish).toHaveBeenCalledWith({
      repository: 'OWOX/example',
      scope: 'member',
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  // Installation rows carry visibleViaScopes too; the Plugins page draws kept cards from them.
  it('refreshes installations along with the Gallery', async () => {
    vi.mocked(pluginsService.unpublish).mockResolvedValue(undefined as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePluginPublishing(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.unpublish('OWOX/example', 'member');
    });

    expect(invalidated).toHaveBeenCalledWith({ queryKey: ['plugin-installations', 'project-1'] });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ['plugin-gallery', 'project-1'] });
  });
});
