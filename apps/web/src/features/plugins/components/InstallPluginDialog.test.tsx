import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { InstallPluginDialog } from './InstallPluginDialog';

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
    repositoryUrl: 'https://github.com/acme/example-plugin',
  },
  ...over,
});

describe('InstallPluginDialog', () => {
  /**
   * The three statements a member must see before granting their authority to third-party
   * code. Wording is product copy, but the facts are the authoring-guide contract.
   */
  it('states access, data exfiltration, and that reinstall restores nothing on the plugin side', () => {
    render(
      <InstallPluginDialog
        plugin={plugin()}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    const notice = screen.getByTestId('install-data-notice');

    expect(notice).toHaveTextContent('Acts with your access to OWOX Data Marts.');
    expect(notice).toHaveTextContent(
      'Anything it reads can leave OWOX and reach the plugin publisher.'
    );
    expect(notice).toHaveTextContent(
      'Reinstalling restores nothing the plugin kept on its own side.'
    );
  });

  it('shows display metadata and the current SemVer required by §13', () => {
    render(
      <InstallPluginDialog
        plugin={plugin()}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('Example Plugin')).toBeInTheDocument();
    expect(screen.getByTestId('install-version')).toHaveTextContent('v1.2.3');
  });

  /**
   * Publisher-controlled name is React text, never markup. A raw HTML sink here would run
   * third-party code at the moment a member is about to grant their authority.
   */
  it('renders a hostile display name as text, not as DOM', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <InstallPluginDialog
        plugin={plugin({ displayName: hostile })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not turn a non-https source url into an anchor href', () => {
    render(
      <InstallPluginDialog
        plugin={plugin({
          source: {
            ownerName: 'acme',
            ownerUrl: 'javascript:alert(1)',
            repositoryUrl: 'javascript:alert(2)',
          },
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
