import { useCallback, useEffect, useState } from 'react';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { DataMartMemberAccessItemDto } from '../../../shared/types/api/response/data-mart-member-access.response.dto';

interface UseDataMartMemberAccessResult {
  /** Null until the first answer arrives, and after a failed read. */
  members: DataMartMemberAccessItemDto[] | null;
  isLoading: boolean;
  /** A failed read must never be shown as "nobody can see this Data Mart". */
  hasError: boolean;
  retry: () => void;
}

/**
 * Which project members can see a Data Mart, and why — read from the backend, which applies the
 * same decision the catalog and MCP enforce.
 *
 * `refreshKey` should change whenever an input of that decision changes on the page (sharing,
 * contexts, owners, status), so the answer follows the admin's edits.
 */
export function useDataMartMemberAccess(
  dataMartId: string,
  refreshKey: string,
  enabled: boolean
): UseDataMartMemberAccessResult {
  const [members, setMembers] = useState<DataMartMemberAccessItemDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Incremented by retry; a new value re-arms the fetch effect.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt(current => current + 1);
  }, []);

  // An answer belongs to one Data Mart; never show mart A's members on mart B.
  useEffect(() => {
    setMembers(null);
  }, [dataMartId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setHasError(false);

    dataMartService
      .getMemberAccess(dataMartId, {
        signal: abortController.signal,
        skipLoadingIndicator: true,
        // The list renders its own error with a retry; a global toast on every refetch would repeat it.
        skipErrorToast: true,
      })
      .then(response => {
        setMembers(response.members);
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setMembers(null);
        setHasError(true);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [dataMartId, refreshKey, enabled, attempt]);

  return { members, isLoading, hasError, retry };
}
