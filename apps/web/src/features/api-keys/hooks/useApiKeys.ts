import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiKeysService } from '../services/api-keys.service';
import type { ProjectMemberApiKey } from '../types';

export function useApiKeys() {
  const [keys, setKeys] = useState<ProjectMemberApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await apiKeysService.getKeys();
      setKeys(data);
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const revokeKey = useCallback(
    async (apiKeyId: string) => {
      try {
        await apiKeysService.revokeKey(apiKeyId);
        toast.success('API key revoked');
        void fetchKeys();
      } catch {
        toast.error('Failed to revoke API key');
        void fetchKeys();
      }
    },
    [fetchKeys]
  );

  return { keys, loading, fetchKeys, revokeKey };
}
