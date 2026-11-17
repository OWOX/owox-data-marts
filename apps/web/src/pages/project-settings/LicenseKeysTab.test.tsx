import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseKey } from '../../features/license-keys/types';
import { LicenseKeysTab } from './LicenseKeysTab';

const keys = [
  { licenseKeyId: 'k1', name: 'Key one' },
  { licenseKeyId: 'k2', name: 'Key two' },
] as LicenseKey[];

const mocks = vi.hoisted(() => ({
  flag: 'false',
  isAdmin: true,
  toastError: vi.fn(),
  useLicenseKeys: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));

vi.mock('../../app/store/hooks', () => ({
  useFlags: () => ({ flags: { LICENSE_ISSUANCE_ENABLED: mocks.flag } }),
}));

vi.mock('../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => mocks.isAdmin }));

vi.mock('../../features/license-keys/hooks/useLicenseKeys', () => ({
  useLicenseKeys: mocks.useLicenseKeys,
}));

vi.mock('../../features/license-keys/components/LicenseKeysTable/LicenseKeysTable', () => ({
  LicenseKeysTable: ({ onEdit }: { onEdit?: (key: LicenseKey) => void }) => (
    <button
      onClick={() => {
        onEdit?.(keys[0]);
      }}
    >
      Edit Key one
    </button>
  ),
}));

vi.mock('../../features/license-keys/components/CreateLicenseKeySheet', () => ({
  CreateLicenseKeySheet: () => null,
}));
vi.mock('../../features/license-keys/components/LicenseKeyRevealDialog', () => ({
  LicenseKeyRevealDialog: () => null,
}));
vi.mock('../../features/license-keys/components/EditLicenseKeySheet', () => ({
  EditLicenseKeySheet: ({
    licenseKey,
    link,
    onClose,
  }: {
    licenseKey: LicenseKey | null;
    link?: string | null;
    onClose: () => void;
  }) =>
    licenseKey ? (
      <div data-testid='editSheet'>
        {licenseKey.name}
        <span data-testid='editLink'>{link}</span>
        <button onClick={onClose}>Close sheet</button>
      </div>
    ) : null,
}));

function Search() {
  return <div data-testid='search'>{useLocation().search}</div>;
}

function renderTab(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/keys',
        element: (
          <>
            <LicenseKeysTab />
            <Search />
          </>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
}

function loaded(overrides: Record<string, unknown> = {}) {
  mocks.useLicenseKeys.mockReturnValue({
    keys,
    loading: false,
    hasLoaded: true,
    error: null,
    fetchKeys: vi.fn(),
    revokeKey: vi.fn(),
    ...overrides,
  });
}

describe('LicenseKeysTab', () => {
  beforeEach(() => {
    mocks.flag = 'true';
    mocks.isAdmin = true;
    mocks.toastError.mockClear();
    loaded();
  });

  it('disables the API hook before redirecting a hidden route', () => {
    mocks.flag = 'false';
    loaded({ keys: [], loading: true });
    render(
      <MemoryRouter initialEntries={['/project/settings/license-keys']}>
        <LicenseKeysTab />
      </MemoryRouter>
    );

    expect(mocks.useLicenseKeys).toHaveBeenCalledWith(false);
  });

  it('opens the linked key, keeps the parameter while open and drops it on close', async () => {
    renderTab('/keys?licenseKey=k2');

    expect(await screen.findByTestId('editSheet')).toHaveTextContent('Key two');
    expect(screen.getByTestId('search').textContent).toBe('?licenseKey=k2');
    expect(screen.getByTestId('editLink').textContent).toContain('/keys?licenseKey=k2');

    fireEvent.click(screen.getByText('Close sheet'));
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('writes the key to the URL when a row opens the sheet', async () => {
    renderTab('/keys');

    fireEvent.click(screen.getByText('Edit Key one'));

    expect(await screen.findByTestId('editSheet')).toHaveTextContent('Key one');
    expect(screen.getByTestId('search').textContent).toBe('?licenseKey=k1');
  });

  it('shows a toast and drops the parameter for an unknown key', async () => {
    renderTab('/keys?licenseKey=gone');

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This license key was deleted or is not available.',
        { id: 'licenseKey-not-found' }
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toBe('');
    });
  });

  it('opens no sheet and shows no toast for a non-admin with a link', () => {
    mocks.isAdmin = false;
    renderTab('/keys?licenseKey=k1');

    expect(screen.queryByTestId('editSheet')).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('waits while the keys load', () => {
    loaded({ keys: [], loading: true, hasLoaded: false });
    renderTab('/keys?licenseKey=k1');

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?licenseKey=k1');
  });

  it('waits during a retry after a failed first load', () => {
    // Retry clears the error, but `loading` stays false and no key has loaded yet.
    loaded({ keys: [], hasLoaded: false });
    renderTab('/keys?licenseKey=k1');

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('search').textContent).toBe('?licenseKey=k1');
  });
});
