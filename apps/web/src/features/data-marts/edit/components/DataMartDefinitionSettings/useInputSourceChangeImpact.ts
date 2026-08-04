import { useCallback, useEffect, useState } from 'react';
import { dataMartService } from '../../../shared';

export interface InputSourceChangeImpact {
  /** Relationships where this Data Mart joins another one. */
  outboundRelationships: number;
  /** Relationships where another Data Mart joins this one. */
  inboundRelationships: number;
  reports: number;
}

interface UseInputSourceChangeImpactResult {
  impact: InputSourceChangeImpact | null;
  isLoading: boolean;
  /**
   * True when the read failed. Distinct from `impact === null` while loading: a failure must
   * never be presented as "nothing depends on this Data Mart".
   */
  hasError: boolean;
  retry: () => void;
}

/**
 * Counts what depends on a Data Mart, so the user can judge the blast radius before repointing it
 * at another input source. The counts come from a single authorized backend read rather than being
 * assembled client-side, so inbound relationships and reports are counted where they actually live.
 *
 * Only fetches while `enabled` is true, so the read happens when the confirmation is on screen
 * rather than on every visit to the Input Source block.
 */
export function useInputSourceChangeImpact(
  dataMartId: string,
  enabled: boolean
): UseInputSourceChangeImpactResult {
  const [impact, setImpact] = useState<InputSourceChangeImpact | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Incremented by retry; a new value re-arms the fetch effect.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt(current => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setHasError(false);

    dataMartService
      .getInputSourceChangeImpact(dataMartId, { signal: abortController.signal })
      .then(response => {
        setImpact({
          outboundRelationships: response.outboundRelationshipsCount,
          inboundRelationships: response.inboundRelationshipsCount,
          reports: response.reportsCount,
        });
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        // Counts are advisory, so a failed read must not block confirmation — but it must be
        // reported as unknown, never rendered as zero dependencies.
        setImpact(null);
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
  }, [dataMartId, enabled, attempt]);

  return { impact, isLoading, hasError, retry };
}
