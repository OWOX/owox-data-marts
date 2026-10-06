import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginPageMessage as ActualPluginPageMessage } from '../../../features/plugins/components/PluginPageMessage';

const navigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});
vi.mock('../../../shared/hooks', () => ({
  useProjectId: () => 'project-1',
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
const user = { id: 'u1', fullName: 'A Member' };
let authUser = user;
vi.mock('../../../features/idp', () => ({
  useAuth: () => ({ user: authUser }),
}));
interface CapturedBridgeOptions {
  context?: { route?: string };
  onBroken?: () => void;
  onOpenExternal?: (url: string) => void;
  onNavigate?: (path: string) => void;
  onRouteChange?: (route: string) => void;
  onCopyLink?: (route: string | undefined) => Promise<void> | void;
}
const bridgeOptions: CapturedBridgeOptions = {};
let bridgeCreations = 0;
const copyLink = vi.fn(() => Promise.resolve());

vi.mock('../../../features/plugins', async () => ({
  ...(await vi.importActual<typeof import('../../../features/plugins/runtime/pluginRoute')>(
    '../../../features/plugins/runtime/pluginRoute'
  )),
  pluginsService: { getEntryPoint: vi.fn() },
  // The bridge has its own suite; here it only needs to not explode, so the page's
  // sandbox attributes stay the thing under test.
  createPluginHostBridge: (options: CapturedBridgeOptions) => {
    bridgeCreations += 1;
    bridgeOptions.context = options.context;
    bridgeOptions.onBroken = options.onBroken;
    bridgeOptions.onOpenExternal = options.onOpenExternal;
    bridgeOptions.onNavigate = options.onNavigate;
    bridgeOptions.onRouteChange = options.onRouteChange;
    bridgeOptions.onCopyLink = options.onCopyLink;
    return { dispose: () => undefined };
  },
  fetchRuntimeToken: () => () => Promise.resolve({ runtimeToken: 't', expiresIn: 900 }),
  useCopyLink: () => ({ copyLink, fallbackDialog: null }),
  PluginPageMessage: ActualPluginPageMessage,
}));

import { pluginsService } from '../../../features/plugins';
import { PluginRuntime } from './PluginRuntimePage';

const getEntryPoint = vi.mocked(pluginsService.getEntryPoint);

const ENTRY = {
  deliveryUrl: 'https://plugin.example.com',
  displayName: 'Example Plugin',
  pluginId: 'p1',
  versionId: 'v1',
  credentialHandles: [],
};
const OPEN_BASE = '/ui/project-1/plugins/p1/open';
function renderPage(initialRoute = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(
    <PluginRuntime installationId='i1' initialRoute={initialRoute} openBase={OPEN_BASE} />,
    {
      wrapper,
    }
  );
  return Object.assign(view, { client });
}

async function mountWithBridge(initialRoute = '/') {
  const view = renderPage(initialRoute);
  await waitFor(() => {
    expect(bridgeCreations).toBe(1);
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return view;
}

describe('PluginRuntimePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeCreations = 0;
    authUser = user;
    getEntryPoint.mockResolvedValue(ENTRY);
    window.history.replaceState(null, '', OPEN_BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  /**
   * The single most important assertion in the web app.
   *
   * Omitting allow-same-origin forces an opaque origin, which is what keeps the plugin
   * away from cookies, storage and this document. Adding it back alongside allow-scripts
   * is the classic sandbox escape, and it is exactly the kind of thing someone reaches
   * for when debugging a plugin that will not load.
   */
  it('sandboxes the plugin with exactly two tokens', async () => {
    renderPage();

    const frame = await screen.findByTitle('Example Plugin');

    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-downloads');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('delegates no permissions and leaks no referrer', async () => {
    renderPage();

    const frame = await screen.findByTitle('Example Plugin');

    // An empty allow denies every delegable Permissions Policy feature at once.
    expect(frame).toHaveAttribute('allow', '');
    // Our path carries the project id; the vendor has no business learning it.
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  // Suspension leaves the installation intact, so saying so is different from reporting
  // a broken plugin -- the member does not need to reinstall anything.
  it('explains a suspension rather than reporting a generic failure', async () => {
    getEntryPoint.mockRejectedValue({ response: { data: { code: 'PLUGIN_SUSPENDED' } } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Temporarily unavailable')).toBeInTheDocument();
    });
    expect(screen.getByText(/Your installation is untouched/)).toBeInTheDocument();
  });

  /**
   * A bridge that closed its own channel leaves a frame that answers nothing. Painted, it
   * reads as a slow plugin rather than a broken one, and the member waits on a page that
   * will never do anything.
   */
  it('replaces the frame when the bridge closes the channel itself', async () => {
    renderPage();
    await screen.findByTitle('Example Plugin');

    act(() => {
      bridgeOptions.onBroken?.();
    });

    expect(screen.queryByTitle('Example Plugin')).not.toBeInTheDocument();
    expect(screen.getByText('This plugin could not be opened')).toBeInTheDocument();
    expect(screen.getByText(/did not complete the handshake/)).toBeInTheDocument();
  });

  /**
   * The plugin can neither navigate nor open a window itself -- the sandbox denies both --
   * so it asks, and the host answers by rules that differ per ask: one leaves the app in a
   * new tab, the other replaces the page the plugin is running on.
   */
  describe('what the plugin asks the host to open', () => {
    const mount = async () => {
      renderPage();
      await screen.findByTitle('Example Plugin');
      return vi.spyOn(window, 'open').mockReturnValue(null);
    };

    it('opens an external https link in a new tab with the opener severed', async () => {
      const open = await mount();

      act(() => {
        bridgeOptions.onOpenExternal?.('https://docs.example.test/page');
      });

      expect(open).toHaveBeenCalledWith(
        'https://docs.example.test/page',
        '_blank',
        'noopener,noreferrer'
      );
      expect(navigate).not.toHaveBeenCalled();
    });

    it.each([
      ['an insecure link', 'http://insecure.example.test/'],
      ['a javascript url', 'javascript:alert(1)'],
      // An in-app path is not an external link, and openExternal is not the way to ask.
      ['an app path', '/ui/project-1/data-marts/dm-1'],
    ])('does not open %s', async (_label, url) => {
      const open = await mount();

      act(() => {
        bridgeOptions.onOpenExternal?.(url);
      });

      expect(open).not.toHaveBeenCalled();
    });

    it('routes an app path in place', async () => {
      const open = await mount();

      act(() => {
        bridgeOptions.onNavigate?.('/ui/project-1/data-marts/dm-1?tab=overview');
      });

      expect(navigate).toHaveBeenCalledWith('/ui/project-1/data-marts/dm-1?tab=overview');
      expect(open).not.toHaveBeenCalled();
    });

    /**
     * `//evil.example/x` is not a path: resolved against this origin it becomes another
     * host entirely, and `/\evil.example/x` becomes one through URL parsing's treatment
     * of backslashes. Neither may turn navigation into a way out of the app.
     */
    it.each([
      ['a protocol-relative host', '//evil.example/x'],
      ['a backslash that URL parsing turns into a host', '/\\evil.example/x'],
      ['an absolute foreign url', 'https://evil.example/x'],
      ['a relative path', 'data-marts/dm-1'],
    ])('refuses to navigate to %s', async (_label, path) => {
      await mount();

      act(() => {
        bridgeOptions.onNavigate?.(path);
      });

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('offers a way back when the plugin cannot be opened at all', async () => {
    getEntryPoint.mockRejectedValue({ response: { status: 404 } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('This plugin could not be opened')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Back to plugins' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins'
    );
  });

  it('hands the route it was opened at to the plugin', async () => {
    renderPage('/d/42?tab=2');
    await waitFor(() => {
      expect(bridgeOptions.context?.route).toBe('/d/42?tab=2');
    });
  });

  // The SDK reads an absent route as a host without page links, so the root is sent too.
  it('hands the root route to the plugin as well', async () => {
    renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    expect(bridgeOptions.context).toHaveProperty('route', '/');
  });

  it('keeps one bridge and replaces the address once for reports in quick succession', async () => {
    await mountWithBridge();

    act(() => {
      bridgeOptions.onRouteChange?.('/d/1');
      bridgeOptions.onRouteChange?.('/d/2');
    });
    vi.advanceTimersByTime(349);
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`${OPEN_BASE}/d/2`, { replace: true });
    expect(bridgeCreations).toBe(1);
  });

  it('schedules nothing for a refused report', async () => {
    await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/../settings'));

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['the same page', `${OPEN_BASE}/d/1`, ['/d/1']],
    ['the page under campaign tags', `${OPEN_BASE}/d/1?utm_source=owox.com`, ['/d/1']],
    [
      'the root under campaign tags',
      `${OPEN_BASE}?utm_source=owox.com&utm_medium=site`,
      ['/d/1', '/'],
    ],
    ['the encoded form of a raw route', `${OPEN_BASE}/d/a%20b`, ['/d/a b']],
  ])('leaves the address alone when it already shows %s', async (_label, address, reports) => {
    await mountWithBridge();
    window.history.replaceState(null, '', address);

    act(() => {
      for (const route of reports) bridgeOptions.onRouteChange?.(route);
    });
    vi.runOnlyPendingTimers();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not pull the member back after they leave the plugin', async () => {
    await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/d/1'));
    window.history.replaceState(null, '', '/ui/project-1/data-marts');
    act(() => bridgeOptions.onRouteChange?.('/d/2'));
    vi.runOnlyPendingTimers();

    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'rejects',
      () => {
        const rejected = Promise.reject(new DOMException('Too many calls', 'SecurityError'));
        // Not a Promise instance, so the spy does not mark the rejection as handled.
        return { then: rejected.then.bind(rejected) };
      },
    ],
    [
      'throws',
      () => {
        throw new DOMException('Too many calls', 'SecurityError');
      },
    ],
  ])('survives a navigation that %s and keeps the address in step', async (_label, fail) => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await mountWithBridge();
      navigate.mockImplementationOnce(fail);

      act(() => bridgeOptions.onRouteChange?.('/d/1'));
      vi.runOnlyPendingTimers();
      await new Promise(resolve => setImmediate(resolve));
      act(() => bridgeOptions.onRouteChange?.('/d/2'));
      vi.runOnlyPendingTimers();

      expect(unhandled).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenLastCalledWith(`${OPEN_BASE}/d/2`, { replace: true });
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('drops a pending address update when another installation takes over', async () => {
    const view = await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/d/1'));
    view.rerender(<PluginRuntime installationId='i2' initialRoute='/x' openBase={OPEN_BASE} />);
    vi.runOnlyPendingTimers();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('still schedules and syncs the address for a later report after an installation change', async () => {
    const view = renderPage();
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    view.rerender(<PluginRuntime installationId='i2' initialRoute='/x' openBase={OPEN_BASE} />);
    await waitFor(() => {
      expect(bridgeCreations).toBe(2);
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => bridgeOptions.onRouteChange?.('/d/9'));
    vi.runOnlyPendingTimers();

    expect(navigate).toHaveBeenCalledWith(`${OPEN_BASE}/d/9`, { replace: true });
  });

  it('drops a pending address update on unmount', async () => {
    const view = await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/d/1'));
    view.unmount();
    vi.runOnlyPendingTimers();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('copies a link to the page the plugin names', async () => {
    renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    await act(() => bridgeOptions.onCopyLink?.('/d/9'));

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/9`);
  });

  it('passes a declined copy back to the plugin', async () => {
    copyLink.mockRejectedValueOnce(new Error('declined'));
    await mountWithBridge();

    await expect(bridgeOptions.onCopyLink?.('/d/9')).rejects.toThrow();
  });

  it('copies the last reported page when the plugin names none', async () => {
    renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    act(() => bridgeOptions.onRouteChange?.('/d/5'));
    await act(() => bridgeOptions.onCopyLink?.(undefined));

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/5`);
  });

  it('copies the initial route when the plugin never reported one', async () => {
    renderPage('/d/3');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    await act(() => bridgeOptions.onCopyLink?.(undefined));

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/3`);
  });

  it('puts the encoded form of a raw route in the address and the copied link', async () => {
    await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/d/a b'));
    vi.runOnlyPendingTimers();
    await bridgeOptions.onCopyLink?.(undefined);

    expect(navigate).toHaveBeenCalledWith(`${OPEN_BASE}/d/a%20b`, { replace: true });
    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/a%20b`);
  });

  it('copies the encoded form of a raw route the plugin names', async () => {
    await mountWithBridge();

    await bridgeOptions.onCopyLink?.('/d/a b');

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/a%20b`);
  });

  it('drops a campaign tag from a route the plugin reports, keeping the other parameters', async () => {
    await mountWithBridge();

    act(() => bridgeOptions.onRouteChange?.('/d?utm_source=x&a=1'));
    vi.runOnlyPendingTimers();

    expect(navigate).toHaveBeenCalledWith(`${OPEN_BASE}/d?a=1`, { replace: true });
  });

  it('drops a campaign tag from a route the plugin names to copyLink', async () => {
    await mountWithBridge();

    await bridgeOptions.onCopyLink?.('/d?utm_medium=y');

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d`);
  });

  it('keeps the last valid route when a report is refused', async () => {
    await mountWithBridge();

    act(() => {
      bridgeOptions.onRouteChange?.('/d/5');
      bridgeOptions.onRouteChange?.('/../settings');
    });
    vi.runOnlyPendingTimers();
    await bridgeOptions.onCopyLink?.(undefined);

    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/5`);
    expect(navigate).not.toHaveBeenCalledWith(`${OPEN_BASE}/../settings`, { replace: true });
  });

  it('keeps the plugin on its page when the member token refreshes', async () => {
    const view = renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    act(() => bridgeOptions.onRouteChange?.('/d/5'));
    authUser = { ...user };
    view.rerender(<PluginRuntime installationId='i1' initialRoute='/' openBase={OPEN_BASE} />);
    await act(() => bridgeOptions.onCopyLink?.(undefined));

    expect(bridgeCreations).toBe(1);
    expect(copyLink).toHaveBeenCalledWith(`${window.location.origin}${OPEN_BASE}/d/5`);
  });

  it('starts a rebuilt bridge at the last reported page', async () => {
    const view = renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    act(() => bridgeOptions.onRouteChange?.('/d/7'));
    getEntryPoint.mockResolvedValue({ ...ENTRY, versionId: 'v2' });
    await act(() => view.client.invalidateQueries({ queryKey: ['plugin-entry'] }));

    await waitFor(() => {
      expect(bridgeCreations).toBe(2);
    });
    expect(bridgeOptions.context?.route).toBe('/d/7');
  });

  it('starts another installation at its own route, not the last one reported', async () => {
    const view = renderPage('/');
    await waitFor(() => {
      expect(bridgeCreations).toBe(1);
    });

    act(() => bridgeOptions.onRouteChange?.('/d/7'));
    view.rerender(<PluginRuntime installationId='i2' initialRoute='/x' openBase={OPEN_BASE} />);

    await waitFor(() => {
      expect(bridgeCreations).toBe(2);
    });
    expect(bridgeOptions.context?.route).toBe('/x');
  });
});
