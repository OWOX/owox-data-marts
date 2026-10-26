import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageHealthStatus } from '../../services/data-storage-health-status.service';
import type { StorageCredentialState, StorageCredentialSummary } from '../../model/types';
import { DataStorageHealthIndicator } from './DataStorageHealthIndicator';

const health = vi.hoisted(() => ({
  status: 'reauth_required' as string,
  errorMessage: 'A Credential maintainer can reconnect it on the Credentials page.',
}));

vi.mock('../../model/hooks/useDataStorageHealthStatus', () => ({
  useDataStorageHealthStatus: () => ({
    status: health.status,
    errorMessage: health.errorMessage,
    isLoading: false,
    isFetched: true,
  }),
}));

// The dot does not pass the trigger's props on, so the tooltip never opens in a browser; render it inline.
vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

const restricted = (state: StorageCredentialState): StorageCredentialSummary => ({
  access: 'restricted',
  state,
});
const visible = (state: StorageCredentialState): StorageCredentialSummary => ({
  access: 'visible',
  id: 'c',
  title: 'Key',
  definitionId: 'google-oauth',
  providerName: 'Google',
  identity: null,
  state,
});

describe('DataStorageHealthIndicator', () => {
  beforeEach(() => {
    health.status = DataStorageHealthStatus.REAUTH_REQUIRED;
    health.errorMessage = 'A Credential maintainer can reconnect it on the Credentials page.';
  });

  it('shows the server message to a member who can see the Credential', () => {
    render(
      <DataStorageHealthIndicator storageId='s1' credential={visible('reconnect-required')} />
    );

    expect(screen.getByText(/A Credential maintainer can reconnect it/)).toBeInTheDocument();
  });

  it.each([
    [DataStorageHealthStatus.REAUTH_REQUIRED, 'reconnect-required', 'reconnect'],
    [DataStorageHealthStatus.REAUTH_REQUIRED, 'reauthorize-required', 'reconnect'],
    [DataStorageHealthStatus.INVALID, 'disabled', 'enable'],
  ] as const)(
    'tells a member who cannot see the Credential who can fix it (%s, %s)',
    (status, state, verb) => {
      health.status = status;
      render(<DataStorageHealthIndicator storageId='s1' credential={restricted(state)} />);

      expect(screen.getByText(`Ask the Credential's owner to ${verb} it`)).toBeInTheDocument();
      expect(screen.queryByText(/maintainer/)).toBeNull();
    }
  );

  it('says Google sign-in is missing to everyone', () => {
    health.status = DataStorageHealthStatus.INVALID;
    render(<DataStorageHealthIndicator storageId='s1' credential={visible('not-configured')} />);

    expect(screen.getByText('Google sign-in is not configured on this server')).toBeInTheDocument();
  });

  it('falls back to the owner copy when health sees a lost grant before the summary does', () => {
    render(<DataStorageHealthIndicator storageId='s1' credential={restricted('ready')} />);

    expect(screen.getByText("Ask the Credential's owner to reconnect it")).toBeInTheDocument();
    expect(screen.queryByText(/maintainer/)).toBeNull();
  });

  describe('compact hovercard', () => {
    // Resolves once the hovercard is open, so assertions never match the inline tooltip.
    const open = async (credential: StorageCredentialSummary | null) => {
      render(
        <DataStorageHealthIndicator storageId='s1' variant='compact' credential={credential} />
      );
      fireEvent.pointerEnter(document.querySelector('.group')!);
      fireEvent.mouseEnter(document.querySelector('.group')!);
      const header = await screen.findByText('Storage validation result');
      return within(header.closest<HTMLElement>("[data-slot='hover-card-content']")!);
    };

    it('gives the dot tooltip and the hovercard the same instruction', async () => {
      const hovercard = await open(restricted('reconnect-required'));
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        "Ask the Credential's owner to reconnect it"
      );
      expect(hovercard.getByText("Ask the Credential's owner to reconnect it")).toBeInTheDocument();
      expect(screen.queryByText('Reconnect the Credential')).toBeNull();
    });

    it('falls back to the owner copy in the hovercard before the summary shows the lost grant', async () => {
      const hovercard = await open(restricted('ready'));

      expect(hovercard.getByText("Ask the Credential's owner to reconnect it")).toBeInTheDocument();
    });

    it('names the owner to a member who cannot see a disabled Credential', async () => {
      health.status = DataStorageHealthStatus.INVALID;
      const hovercard = await open(restricted('disabled'));

      expect(hovercard.getByText("Ask the Credential's owner to enable it")).toBeInTheDocument();
    });

    it('says the Credential is disabled to a member who can see it', async () => {
      health.status = DataStorageHealthStatus.INVALID;
      const hovercard = await open(visible('disabled'));

      expect(hovercard.getByText('Credential disabled')).toBeInTheDocument();
    });

    it('keeps the plain failure line without a Credential cause', async () => {
      health.status = DataStorageHealthStatus.INVALID;
      const hovercard = await open(null);

      expect(
        hovercard.getByText('Storage access failed. Check Storage settings.')
      ).toBeInTheDocument();
    });
  });
});
