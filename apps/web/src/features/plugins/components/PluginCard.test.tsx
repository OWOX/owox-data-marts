import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { PluginCard } from './PluginCard';
import { pluginsService } from '../services/plugins.service';

vi.mock('../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

vi.mock('../../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../services/plugins.service', () => ({
  pluginsService: { checkNow: vi.fn() },
}));

const service = pluginsService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const onInstall = vi.fn();

const XSS_NAME = '<img src=x onerror=alert(1)>';
const XSS_DESCRIPTION = '<script>alert(1)</script>';

const plugin = (over: Partial<PluginGalleryEntry> = {}): PluginGalleryEntry => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  description: 'Does a thing',
  currentSemver: '1.2.3',
  currentVersionId: 'v1',
  suspended: false,
  installationState: 'not_installed',
  visibleViaScopes: ['member'],
  source: {
    ownerName: 'acme',
    ownerUrl: 'https://github.com/acme',
  },
  ...over,
});

function renderCards(...cards: PluginGalleryEntry[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ui/project-1/plugins']}>
        <Routes>
          <Route
            path='/ui/project-1/plugins'
            element={cards.map(card => (
              <PluginCard key={card.pluginId} plugin={card} onInstall={onInstall} />
            ))}
          />
          <Route path='/ui/project-1/plugins/p1' element={<div>Plugin page</div>} />
          <Route path='/ui/project-1/plugins/p1/open' element={<div>Plugin open</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PluginCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.checkNow.mockResolvedValue({
      outcome: 'up_to_date',
      updated: false,
      currentSemver: '1.2.3',
    });
  });

  /**
   * Publisher-controlled name and description are rendered as React text, never as HTML.
   * If either became a raw markup sink, a Gallery listing would execute third-party code.
   */
  it('renders hostile display metadata as text, not as DOM', () => {
    const { container } = renderCards(
      plugin({ displayName: XSS_NAME, description: XSS_DESCRIPTION })
    );

    expect(screen.getByText(XSS_NAME)).toBeInTheDocument();
    expect(screen.getByText(XSS_DESCRIPTION)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  // Kept on the Plugins page by the member's own installation after it left the Gallery:
  // the gear leads to its page, where uninstall lives, and the card says why it is still here.
  it('marks an installed plugin nothing lists and leads to its settings', () => {
    renderCards(plugin({ installationState: 'installed', visibleViaScopes: [] }));

    expect(screen.getByLabelText('Installed, not listed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Example Plugin settings' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Install Example Plugin' })).toBeNull();
  });

  it('runs Check and Update from an installed card and stays on the Plugins page', async () => {
    renderCards(plugin({ installationState: 'installed' }));

    fireEvent.click(screen.getByRole('button', { name: 'Check and Update Example Plugin' }));

    await waitFor(() => {
      expect(service.checkNow).toHaveBeenCalledWith('p1');
    });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('Example Plugin is up to date — v1.2.3');
    });
    expect(screen.queryByText('Plugin page')).toBeNull();
    expect(screen.queryByText('Plugin open')).toBeNull();
  });

  it('disables only the card whose check is running', async () => {
    service.checkNow.mockReturnValue(new Promise(() => {}));
    renderCards(
      plugin({ installationState: 'installed' }),
      plugin({ pluginId: 'p2', displayName: 'Other Plugin', installationState: 'installed' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check and Update Example Plugin' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Check and Update Example Plugin' })
      ).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Check and Update Other Plugin' })).toBeEnabled();
  });

  it('shows Check and Update on hover or focus, and keeps it shown while the check runs', async () => {
    service.checkNow.mockReturnValue(new Promise(() => {}));
    renderCards(plugin({ installationState: 'installed' }));
    const button = screen.getByRole('button', { name: 'Check and Update Example Plugin' });

    expect(button).toHaveClass('opacity-0', 'group-hover:opacity-100', 'focus-visible:opacity-100');
    // Touch screens have no hover: hidden, the button must not take a tap meant for the card.
    expect(button).toHaveClass('pointer-events-none', 'group-hover:pointer-events-auto');
    // group-hover needs the card itself to be the group.
    expect(button.closest('.group')).toHaveClass('cursor-pointer');

    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveClass('opacity-100');
    });
    expect(button).not.toHaveClass('opacity-0');
  });

  it.each(['not_installed', 'uninstalled'] as const)(
    'offers no Check and Update on a %s card',
    state => {
      renderCards(plugin({ installationState: state }));
      expect(screen.queryByRole('button', { name: /Check and Update/ })).toBeNull();
    }
  );

  it('keeps Check and Update on a suspended installed plugin, after the Unavailable badge', () => {
    renderCards(plugin({ installationState: 'installed', suspended: true }));
    const button = screen.getByRole('button', { name: 'Check and Update Example Plugin' });

    expect(button).toBeEnabled();
    // The hidden button must not push the badge away from the version.
    expect(
      screen.getByText('Unavailable').compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  // The tooltip renders in a portal, but React still sends its click up to the card.
  it('does not open the plugin page on a click on the tooltip', async () => {
    renderCards(plugin({ installationState: 'installed' }));

    fireEvent.focus(screen.getByRole('button', { name: 'Check and Update Example Plugin' }));
    const [tooltip] = await screen.findAllByText('Check and Update');
    fireEvent.click(tooltip);

    expect(screen.queryByText('Plugin page')).toBeNull();
    expect(screen.queryByText('Plugin open')).toBeNull();
    expect(service.checkNow).not.toHaveBeenCalled();
  });

  describe('card navigation', () => {
    it.each<[string, Partial<PluginGalleryEntry>]>([
      ['an installed', {}],
      ['an installed suspended', { suspended: true }],
      ['an installed unlisted', { visibleViaScopes: [] }],
    ])('opens %s plugin from the card body', async (_name, over) => {
      renderCards(plugin({ installationState: 'installed', ...over }));

      fireEvent.click(screen.getByText('Does a thing'));

      expect(await screen.findByText('Plugin open')).toBeInTheDocument();
    });

    it('opens the plugin page from the gear of an installed card', async () => {
      renderCards(plugin({ installationState: 'installed' }));

      fireEvent.click(screen.getByRole('button', { name: 'Open Example Plugin settings' }));

      expect(await screen.findByText('Plugin page')).toBeInTheDocument();
    });

    it.each([
      ['a not_installed', { installationState: 'not_installed' }],
      ['an uninstalled', { installationState: 'uninstalled' }],
      ['a not_installed suspended', { installationState: 'not_installed', suspended: true }],
    ] as const)('opens the plugin page from the body of %s card', async (_name, over) => {
      renderCards(plugin(over));

      fireEvent.click(screen.getByText('Does a thing'));

      expect(await screen.findByText('Plugin page')).toBeInTheDocument();
      expect(screen.queryByText('Plugin open')).toBeNull();
    });

    it('does not navigate when the gear tooltip is clicked', async () => {
      renderCards(plugin({ installationState: 'installed' }));

      fireEvent.focus(screen.getByRole('button', { name: 'Open Example Plugin settings' }));
      const tooltip = (await screen.findAllByText('Settings'))[0];
      fireEvent.click(tooltip);

      expect(screen.queryByText('Plugin page')).toBeNull();
      expect(screen.queryByText('Plugin open')).toBeNull();
    });

    it('installs from the + without leaving the Plugins page', () => {
      const entry = plugin({ installationState: 'not_installed' });
      renderCards(entry);

      fireEvent.click(screen.getByRole('button', { name: 'Install Example Plugin' }));

      expect(onInstall).toHaveBeenCalledWith(entry);
      expect(screen.queryByText('Plugin page')).toBeNull();
      expect(screen.queryByText('Plugin open')).toBeNull();
    });
  });
});
