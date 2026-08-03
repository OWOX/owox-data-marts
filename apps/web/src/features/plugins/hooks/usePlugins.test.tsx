import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
vi.mock('react-hot-toast', () => {
  // Callable with properties: neutral outcomes use the bare toast(), which is not a
  // success and not an error.
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast };
});
vi.mock('../services/plugins.service', () => ({
  pluginsService: {
    getGallery: vi.fn(),
    getInstallations: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    checkNow: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../services/plugins.service';
import { usePluginActions, usePluginGallery } from './usePlugins';

const service = pluginsService as unknown as Record<string, ReturnType<typeof vi.fn>>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const staleError = (currentSemver: string) => ({
  response: {
    data: {
      code: 'PLUGIN_STALE_VERSION',
      errorDetails: { currentVersionId: 'v2', currentSemver },
    },
  },
});

describe('usePluginGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getGallery.mockResolvedValue([{ pluginId: 'p1' }]);
  });

  it('loads the combined gallery for the current project', async () => {
    const { result } = renderHook(() => usePluginGallery(), { wrapper });

    await waitFor(() => {
      expect(result.current.plugins).toHaveLength(1);
    });
  });
});

describe('usePluginActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.install.mockResolvedValue({ installationId: 'i1' });
    service.uninstall.mockResolvedValue(undefined);
    service.checkNow.mockResolvedValue({
      outcome: 'updated',
      updated: true,
      currentSemver: '2.0.0',
    });
  });

  it('installs with the version the member was shown', async () => {
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.install('p1', 'v1');
    });

    expect(service.install).toHaveBeenCalledWith('p1', 'v1');
  });

  // Any installed member can move a plugin forward at any moment, so a stale
  // confirmation is an ordinary race, not a failure. The caller re-renders with what is
  // current now; a raw toast would tell the member nothing they can act on.
  it('reports a stale confirmation as a signal rather than an error', async () => {
    service.install.mockRejectedValue(staleError('2.0.0'));
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    let signal: unknown;
    await act(async () => {
      signal = await result.current.install('p1', 'v1');
    });

    expect(signal).toEqual({ currentVersionId: 'v2', currentSemver: '2.0.0' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still surfaces a genuine install failure', async () => {
    service.install.mockRejectedValue({ response: { data: { code: 'PLUGIN_SUSPENDED' } } });
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await expect(
      act(async () => {
        await result.current.install('p1', 'v1');
      })
    ).rejects.toBeDefined();
    expect(toast.error).toHaveBeenCalled();
  });

  // Finding nothing newer is the expected outcome most of the time, and presenting it
  // as a failure would train members to ignore the button.
  it('treats finding nothing newer as a plain outcome', async () => {
    service.checkNow.mockResolvedValue({
      outcome: 'up_to_date',
      updated: false,
      currentSemver: '1.0.0',
    });
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.checkNow('p1');
    });

    expect(toast).toHaveBeenCalledWith("You're up to date — v1.0.0");
    expect(toast.error).not.toHaveBeenCalled();
  });

  // A check that never reached GitHub must not read as "you are up to date": the member
  // is told the current version stands and the deployment tries again on its own.
  it('separates a failed check from an up-to-date one', async () => {
    service.checkNow.mockResolvedValue({
      outcome: 'failed',
      updated: false,
      currentSemver: '1.0.0',
    });
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.checkNow('p1');
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't check for updates. v1.0.0 remains active and OWOX will try again automatically."
    );
    // The member cannot act on which host was unreachable, and it is a publisher
    // diagnostic besides.
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).not.toContain('GitHub');
  });

  it('says when another check is already running', async () => {
    service.checkNow.mockResolvedValue({
      outcome: 'already_running',
      updated: false,
      currentSemver: '1.0.0',
    });
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.checkNow('p1');
    });

    expect(toast).toHaveBeenCalledWith('An update check is already running');
  });

  it('names the new version when one was activated', async () => {
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.checkNow('p1');
    });

    expect(toast.success).toHaveBeenCalledWith(
      'Updated to v2.0.0. Everyone using this plugin now has this version.'
    );
  });

  // The browser can be the newer half of a rolling deploy and talk to a backend that
  // sends no outcome at all. Falling back to `updated` keeps the message true rather
  // than reporting every such check as a failure.
  it.each([
    [
      true,
      'success' as const,
      'Updated to v3.0.0. Everyone using this plugin now has this version.',
    ],
    [false, 'plain' as const, "You're up to date — v3.0.0"],
  ])('reads a response with no outcome field (updated=%s)', async (updated, channel, expected) => {
    service.checkNow.mockResolvedValue({ updated, currentSemver: '3.0.0' });
    const { result } = renderHook(() => usePluginActions(), { wrapper });

    await act(async () => {
      await result.current.checkNow('p1');
    });

    expect(channel === 'success' ? toast.success : toast).toHaveBeenCalledWith(expected);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
