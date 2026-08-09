import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { licenseKeysService } from '../services/license-keys.service';
import type { LicenseKey } from '../types';

export function useLicenseKeys(enabled = true) {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setError(null);
    try {
      setKeys(await licenseKeysService.getKeys());
    } catch {
      setError('Failed to load license keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void fetchKeys();
  }, [enabled, fetchKeys]);

  const revokeKey = useCallback(
    async (licenseKeyId: string) => {
      try {
        await licenseKeysService.revokeKey(licenseKeyId);
        toast.success('License key revoked');
      } catch {
        toast.error('Failed to revoke license key');
      } finally {
        void fetchKeys();
      }
    },
    [fetchKeys]
  );

  return { keys, loading, error, fetchKeys, revokeKey };
}
