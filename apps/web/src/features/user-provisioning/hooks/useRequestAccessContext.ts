import { useCallback, useEffect, useState } from 'react';
import {
  type RequestAccessContext,
  userProvisioningService,
} from '../services/user-provisioning.service';

export function useRequestAccessContext() {
  const [context, setContext] = useState<RequestAccessContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContext(await userProvisioningService.getRequestAccessContext());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request access context');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    context,
    loading,
    error,
    refresh: load,
  };
}
