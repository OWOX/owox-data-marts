import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { licenseKeysService } from '../services/license-keys.service';
import { useLicenseKeys } from './useLicenseKeys';

vi.mock('../services/license-keys.service', () => ({
  licenseKeysService: {
    getKeys: vi.fn(),
    revokeKey: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('useLicenseKeys', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(licenseKeysService.getKeys).mockResolvedValue([]);
  });

  it('waits for the feature flag before loading keys', async () => {
    const { rerender } = renderHook(({ enabled }) => useLicenseKeys(enabled), {
      initialProps: { enabled: false },
    });

    expect(licenseKeysService.getKeys).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(licenseKeysService.getKeys).toHaveBeenCalledTimes(1);
    });
  });
});
