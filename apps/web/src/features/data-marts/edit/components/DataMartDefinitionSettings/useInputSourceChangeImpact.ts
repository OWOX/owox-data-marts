import { useEffect, useState } from 'react';
import { modelCanvasService } from '../../../model-canvas/api/model-canvas.service';

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
}

/**
 * Counts what depends on a Data Mart, so the user can judge the blast radius before repointing it
 * at another input source. Relationship counts come from the storage-wide edge list, which is the
 * only read that exposes inbound edges as well as outbound ones.
 *
 * Only fetches while `enabled` is true, so the storage-wide read happens when the confirmation is
 * actually on screen rather than on every visit to the Input Source block.
 */
export function useInputSourceChangeImpact(
  dataMartId: string,
  storageId: string,
  reportsCount: number,
  enabled: boolean
): UseInputSourceChangeImpactResult {
  const [impact, setImpact] = useState<InputSourceChangeImpact | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);

    modelCanvasService
      .getEdges(storageId, { signal: abortController.signal })
      .then(edges => {
        setImpact({
          outboundRelationships: edges.filter(edge => edge.sourceDataMartId === dataMartId).length,
          inboundRelationships: edges.filter(edge => edge.targetDataMartId === dataMartId).length,
          reports: reportsCount,
        });
      })
      .catch(() => {
        // Counts are advisory. A failed read must not block the user from confirming, so we fall
        // back to reporting only what we already know for certain.
        setImpact({ outboundRelationships: 0, inboundRelationships: 0, reports: reportsCount });
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [dataMartId, storageId, reportsCount, enabled]);

  return { impact, isLoading };
}
