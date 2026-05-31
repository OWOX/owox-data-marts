import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MyApiKeysPage } from './MyApiKeysPage';
import type { ProjectMemberApiKey } from '../types';

const useApiKeysMock = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useApiKeys', () => ({
  useApiKeys: useApiKeysMock,
}));

vi.mock('../components/ApiKeysTable/ApiKeysTable', () => ({
  ApiKeysTable: ({
    keys,
    onOpenDetails,
    onEditName,
    onRevoke,
  }: {
    keys: ProjectMemberApiKey[];
    onOpenDetails: (key: ProjectMemberApiKey) => void;
    onEditName: (key: ProjectMemberApiKey) => void;
    onRevoke: (key: ProjectMemberApiKey) => void;
  }) => (
    <div>
      <button
        type='button'
        onClick={() => {
          onOpenDetails(keys[1]);
        }}
      >
        Open Beta details
      </button>
      <button
        type='button'
        onClick={() => {
          onEditName(keys[0]);
        }}
      >
        Edit Alpha name
      </button>
      <button
        type='button'
        onClick={() => {
          onRevoke(keys[0]);
        }}
      >
        Revoke Alpha menu
      </button>
    </div>
  ),
}));

vi.mock('../components/CreateApiKeySheet', () => ({
  CreateApiKeySheet: () => null,
}));

vi.mock('../components/EditApiKeySheet', () => ({
  EditApiKeySheet: ({
    apiKey,
    onClose,
    onRevoke,
  }: {
    apiKey: ProjectMemberApiKey | null;
    onClose: () => void;
    onRevoke: (key: ProjectMemberApiKey) => void;
  }) =>
    apiKey ? (
      <aside role='dialog' aria-label='API Key Details'>
        <div>{apiKey.apiKeyId}</div>
        <button type='button' onClick={onClose}>
          Close details
        </button>
        <button
          type='button'
          onClick={() => {
            onRevoke(apiKey);
          }}
        >
          Revoke API Key
        </button>
      </aside>
    ) : null,
}));

vi.mock('../components/SecretRevealDialog', () => ({
  SecretRevealDialog: () => null,
}));

vi.mock('../../../shared/components/ConfirmationDialog/ConfirmationDialog', () => ({
  ConfirmationDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role='alertdialog' aria-label={title}>
        <div>{description}</div>
        <button type='button' onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button
          type='button'
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel confirmation
        </button>
      </div>
    ) : null,
}));

const apiKeys: ProjectMemberApiKey[] = [
  {
    apiKeyId: 'pmk_alpha1234567890123456',
    name: 'Alpha',
    expiresAt: null,
    createdAt: '2026-05-30T18:00:00.000Z',
    lastAuthenticatedAt: null,
  },
  {
    apiKeyId: 'pmk_beta12345678901234567',
    name: 'Beta',
    expiresAt: null,
    createdAt: '2026-05-31T09:00:00.000Z',
    lastAuthenticatedAt: null,
  },
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid='location'>{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry = '/ui/0/me/api-keys') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MyApiKeysPage />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('MyApiKeysPage', () => {
  const fetchKeys = vi.fn();
  const revokeKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    revokeKey.mockResolvedValue(undefined);
    useApiKeysMock.mockReturnValue({
      keys: apiKeys,
      loading: false,
      fetchKeys,
      revokeKey,
    });
  });

  it('opens a specific API key details sidebar from the URL', () => {
    renderPage('/ui/0/me/api-keys?apiKeyId=pmk_alpha1234567890123456');

    expect(screen.getByRole('dialog', { name: 'API Key Details' })).toHaveTextContent(
      'pmk_alpha1234567890123456'
    );
  });

  it('updates the URL when details are opened from the table', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Open Beta details' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/ui/0/me/api-keys?apiKeyId=pmk_beta12345678901234567'
    );
    expect(screen.getByRole('dialog', { name: 'API Key Details' })).toHaveTextContent(
      'pmk_beta12345678901234567'
    );
  });

  it('removes only the API key details URL parameter when the sidebar closes', () => {
    renderPage('/ui/0/me/api-keys?apiKeyId=pmk_alpha1234567890123456&tab=mine');

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/ui/0/me/api-keys?tab=mine');
    expect(screen.queryByRole('dialog', { name: 'API Key Details' })).not.toBeInTheDocument();
  });

  it('lets the opened sidebar revoke the selected API key', async () => {
    renderPage('/ui/0/me/api-keys?apiKeyId=pmk_alpha1234567890123456');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke API Key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeKey).toHaveBeenCalledWith('pmk_alpha1234567890123456');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/ui/0/me/api-keys');
  });
});
