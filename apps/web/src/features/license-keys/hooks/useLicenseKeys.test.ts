import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('sets hasLoaded only after a successful load', async () => {
    vi.mocked(licenseKeysService.getKeys).mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useLicenseKeys());

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load license keys');
    });
    expect(result.current.hasLoaded).toBe(false);

    await act(() => result.current.fetchKeys());
    expect(result.current.hasLoaded).toBe(true);
  });
});
