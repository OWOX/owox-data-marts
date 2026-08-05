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
    publish: vi.fn(),
    unpublish: vi.fn(),
  },
}));

import { pluginsService } from '../services/plugins.service';
import {
  usePluginPublishing,
  usePublishableScopes,
  type PublishFailure,
} from './usePluginPublications';

const publish = vi.mocked(pluginsService.publish);

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
    publish.mockResolvedValue({ publicationId: 'pub1' } as never);
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
});
