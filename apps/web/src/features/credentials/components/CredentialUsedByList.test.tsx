import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialConsumerReference } from '../types';
import { CredentialUsedByList } from './CredentialUsedByList';
import { SecretReplacementWarning } from './SecretReplacementWarning';

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

const consumer = (
  consumerType: string,
  consumerId: string,
  requirementKey = 'storage',
  title: string | null = null
): CredentialConsumerReference => ({
  consumerType,
  consumerId,
  title,
  requirementKey,
  lastUsedAt: null,
});

const withUsedBy = (usedBy: CredentialConsumerReference[]) => ({ usedBy }) as Credential;

describe('CredentialUsedByList', () => {
  it('links a visible Storage and hides the title of one the member cannot see', () => {
    render(
      <MemoryRouter>
        <CredentialUsedByList
          credential={withUsedBy([
            consumer('storage', 'storage-1', 'storage', 'Warehouse'),
            consumer('storage', 'storage-2'),
            consumer('storage', 'storage-3', 'storage', ''),
            consumer('plugin-installation', 'plugin-1', 'ai'),
          ])}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Warehouse' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-storages?id=storage-1'
    );
    expect(screen.getByText('A Storage you cannot access')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Untitled Storage' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'A Storage you cannot access' })).toBeNull();
    expect(screen.getByText('Plugin · Never used')).toBeInTheDocument();
  });

  it('links a Destination and hides one the member cannot see', () => {
    render(
      <MemoryRouter>
        <CredentialUsedByList
          credential={withUsedBy([
            consumer('destination', 'destination-1', 'destination', 'Sales sheet'),
            consumer('destination', 'destination-2'),
          ])}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Sales sheet' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-destinations?id=destination-1'
    );
    expect(screen.getByText('A Destination you cannot access')).toBeInTheDocument();
    expect(screen.getAllByText('Destination · Never used')).toHaveLength(2);
  });

  it('names a plugin the member cannot access without a title', () => {
    render(
      <MemoryRouter>
        <CredentialUsedByList
          credential={withUsedBy([
            consumer('plugin-installation', 'plugin-1', 'ai'),
            consumer('plugin-installation', 'plugin-2', 'docs', 'Docs writer'),
            consumer('plugin-installation', 'plugin-3', 'sheets', ''),
          ])}
        />
      </MemoryRouter>
    );

    expect(screen.getByTitle('ai')).toHaveTextContent('A plugin you cannot access');
    expect(screen.getByTitle('ai')).toHaveClass('text-muted-foreground');
    expect(screen.getByTitle('docs')).toHaveTextContent('Docs writer');
    expect(screen.getByTitle('docs')).not.toHaveClass('text-muted-foreground');
    expect(screen.getByTitle('sheets')).toHaveTextContent('Untitled plugin');
  });

  it('says when each consumer was last used', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <MemoryRouter>
        <CredentialUsedByList
          credential={withUsedBy([
            {
              ...consumer('storage', 'storage-1', 'storage', 'Warehouse'),
              lastUsedAt: twoHoursAgo,
            },
            consumer('storage', 'storage-2', 'storage', 'Lake'),
          ])}
        />
      </MemoryRouter>
    );

    const [warehouse, lake] = screen.getAllByRole('listitem');
    expect(warehouse).toHaveTextContent('Storage · Last used: 2 hours ago');
    expect(lake).toHaveTextContent('Storage · Never used');
  });

  it('drops its own heading inside a form section, whose title says Used by', () => {
    render(
      <MemoryRouter>
        <CredentialUsedByList
          inSection
          credential={withUsedBy([consumer('storage', 'storage-1', 'storage', 'Warehouse')])}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Warehouse' })).toBeInTheDocument();
    expect(screen.queryByText('Used by')).toBeNull();
  });

  it('scrolls a long list on its own in a dialog, and with the sheet in a form section', () => {
    const credential = withUsedBy(
      Array.from({ length: 15 }, (_, index) =>
        consumer('storage', `storage-${String(index)}`, 'storage', `Storage ${String(index)}`)
      )
    );
    const { rerender } = render(
      <MemoryRouter>
        <CredentialUsedByList credential={credential} />
      </MemoryRouter>
    );
    expect(screen.getByRole('list', { name: 'Used by' })).toHaveClass(
      'max-h-48',
      'overflow-y-auto'
    );

    rerender(
      <MemoryRouter>
        <CredentialUsedByList credential={credential} inSection />
      </MemoryRouter>
    );
    expect(screen.getByRole('list', { name: 'Used by' })).not.toHaveClass('overflow-y-auto');
  });
});

describe('SecretReplacementWarning', () => {
  it.each([
    [1, 'The new secret applies to 1 Storage that uses this Credential.'],
    [3, 'The new secret applies to 3 Storages that use this Credential.'],
  ])('counts %i Storage consumers', (count, text) => {
    const usedBy = Array.from({ length: count }, (_, index) => consumer('storage', `s-${index}`));
    usedBy.push(consumer('plugin-installation', 'p', 'ai'));
    render(<SecretReplacementWarning credential={withUsedBy(usedBy)} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders nothing without Storage consumers', () => {
    const { container } = render(
      <SecretReplacementWarning credential={withUsedBy([consumer('plugin-installation', 'p')])} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('counts Storages and Destinations separately', () => {
    render(
      <SecretReplacementWarning
        credential={withUsedBy([
          consumer('storage', 's-1'),
          consumer('storage', 's-2'),
          consumer('destination', 'd-1'),
        ])}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'The new secret applies to 2 Storages and 1 Destination that use this Credential.'
    );
  });

  it('warns about Destinations alone', () => {
    render(<SecretReplacementWarning credential={withUsedBy([consumer('destination', 'd-1')])} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'The new secret applies to 1 Destination that uses this Credential.'
    );
  });
});
