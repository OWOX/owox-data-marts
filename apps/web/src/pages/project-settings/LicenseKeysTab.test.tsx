import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LicenseKeysTab } from './LicenseKeysTab';

const mocks = vi.hoisted(() => ({
  useLicenseKeys: vi.fn(() => ({
    keys: [],
    loading: true,
    error: null,
    fetchKeys: vi.fn(),
    revokeKey: vi.fn(),
  })),
}));

vi.mock('../../app/store/hooks', () => ({
  useFlags: () => ({ flags: { LICENSE_ISSUANCE_ENABLED: 'false' } }),
}));

vi.mock('../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => true }));

vi.mock('../../features/license-keys/hooks/useLicenseKeys', () => ({
  useLicenseKeys: mocks.useLicenseKeys,
}));

describe('LicenseKeysTab', () => {
  it('disables the API hook before redirecting a hidden route', () => {
    render(
      <MemoryRouter initialEntries={['/project/settings/license-keys']}>
        <LicenseKeysTab />
      </MemoryRouter>
    );

    expect(mocks.useLicenseKeys).toHaveBeenCalledWith(false);
  });
});
