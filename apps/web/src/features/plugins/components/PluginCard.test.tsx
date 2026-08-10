import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { PluginCard } from './PluginCard';

vi.mock('../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

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

describe('PluginCard', () => {
  /**
   * Publisher-controlled name and description are rendered as React text, never as HTML.
   * If either became a raw markup sink, a Gallery listing would execute third-party code.
   */
  it('renders hostile display metadata as text, not as DOM', () => {
    const { container } = render(
      <MemoryRouter>
        <PluginCard
          plugin={plugin({ displayName: XSS_NAME, description: XSS_DESCRIPTION })}
          onInstall={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(XSS_NAME)).toBeInTheDocument();
    expect(screen.getByText(XSS_DESCRIPTION)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
