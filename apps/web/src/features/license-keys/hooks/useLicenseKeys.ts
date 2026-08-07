import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { licenseKeysService } from '../services/license-keys.service';
import type { LicenseKey } from '../types';

export function useLicenseKeys() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      setKeys(await licenseKeysService.getKeys());
    } catch {
      toast.error('Failed to load license keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

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

  return { keys, loading, fetchKeys, revokeKey };
}
