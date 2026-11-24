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
              <PluginCard key={card.pluginId} plugin={card} onInstall={vi.fn()} />
            ))}
          />
          <Route path='/ui/project-1/plugins/:pluginId' element={<div>Plugin page</div>} />
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

  it('opens the plugin page from the card body', async () => {
    renderCards(plugin({ installationState: 'installed' }));
    fireEvent.click(screen.getByText('Does a thing'));
    expect(await screen.findByText('Plugin page')).toBeInTheDocument();
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
  // the card leads to its page, where uninstall lives, and says why it is still here.
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
      expect(toast).toHaveBeenCalledWith("You're up to date — v1.2.3");
    });
    expect(screen.queryByText('Plugin page')).toBeNull();
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

  it('keeps Check and Update on a suspended installed plugin', () => {
    renderCards(plugin({ installationState: 'installed', suspended: true }));
    expect(screen.getByRole('button', { name: 'Check and Update Example Plugin' })).toBeEnabled();
  });
});
