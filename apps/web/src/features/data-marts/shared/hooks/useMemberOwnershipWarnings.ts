import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { dataMartService } from '../services/data-mart.service';

export interface MemberOwnershipWarning {
  userId: string;
  warning: string;
}

export function useMemberOwnershipWarnings() {
  const [warnings, setWarnings] = useState<MemberOwnershipWarning[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dataMartService.get<MemberOwnershipWarning[]>(
        '/member-ownership-warnings'
      );
      setWarnings(data);
    } catch (error) {
      // The endpoint is admin-only; for non-admins the backend replies with 403.
      // Treat that as "no warnings to show" silently — it's the expected path,
      // not a failure. Log everything else so real outages stay visible.
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setWarnings([]);
        return;
      }
      console.error('Failed to fetch member ownership warnings:', error);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { warnings, loading };
}
