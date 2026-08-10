import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useParams: () => ({ installationId: 'i1' }),
    useNavigate: () => navigate,
  };
});
vi.mock('../../../shared/hooks', () => ({
  useProjectId: () => 'project-1',
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
vi.mock('../../../features/idp', () => ({
  useAuth: () => ({ user: { id: 'u1', fullName: 'A Member' } }),
}));
/** Lets a test drive the bridge's callbacks the way the plugin would. */
const bridgeOptions: {
  onBroken?: () => void;
  onOpenExternal?: (url: string) => void;
  onNavigate?: (path: string) => void;
} = {};

vi.mock('../../../features/plugins', () => ({
  pluginsService: { getEntryPoint: vi.fn() },
  // The bridge has its own suite; here it only needs to not explode, so the page's
  // sandbox attributes stay the thing under test.
  createPluginHostBridge: (options: {
    onBroken?: () => void;
    onOpenExternal?: (url: string) => void;
    onNavigate?: (path: string) => void;
  }) => {
    bridgeOptions.onBroken = options.onBroken;
    bridgeOptions.onOpenExternal = options.onOpenExternal;
    bridgeOptions.onNavigate = options.onNavigate;
    return { dispose: () => undefined };
  },
  fetchRuntimeToken: () => () => Promise.resolve({ runtimeToken: 't', expiresIn: 900 }),
}));

import { pluginsService } from '../../../features/plugins';
import PluginRuntimePage from './PluginRuntimePage';

const getEntryPoint = vi.mocked(pluginsService.getEntryPoint);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return render(<PluginRuntimePage />, { wrapper });
}

describe('PluginRuntimePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEntryPoint.mockResolvedValue({
      deliveryUrl: 'https://plugin.example.com',
      displayName: 'Example Plugin',
      pluginId: 'p1',
      versionId: 'v1',
    });
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
});
