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
    } catch {
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
