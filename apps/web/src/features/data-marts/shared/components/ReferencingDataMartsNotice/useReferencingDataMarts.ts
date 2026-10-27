import { useEffect, useMemo, useState } from 'react';
import { dataMartService } from '../../services/data-mart.service';
import type { ReferencingDataMarts } from './ReferencingDataMartsNotice';

interface UseReferencingDataMartsResult extends ReferencingDataMarts {
  isLoading: boolean;
  /** The check failed: the references are unknown, not absent. */
  hasError: boolean;
}

const NONE: ReferencingDataMarts = { dataMarts: [], total: 0 };

// A bulk delete on the canvas can cover dozens of Data Marts; ask about a few at a time.
const BATCH_SIZE = 5;

async function loadInBatches<T>(ids: string[], load: (id: string) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    results.push(...(await Promise.all(ids.slice(index, index + BATCH_SIZE).map(load))));
  }
  return results;
}

/**
 * The SQL Data Marts that reference any of `dataMartIds`, other than those Data Marts themselves
 * (deleting several at once removes references between them too). Loads only while `enabled`, so
 * the check runs when a confirmation is on screen rather than on every visit.
 */
export function useReferencingDataMarts(
  dataMartIds: readonly string[],
  enabled: boolean
): UseReferencingDataMartsResult {
  const [result, setResult] = useState<ReferencingDataMarts>(NONE);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const key = useMemo(() => [...dataMartIds].sort().join(','), [dataMartIds]);

  useEffect(() => {
    if (!enabled || !key) return;
    const ids = key.split(',');
    const selected = new Set(ids);
    const abortController = new AbortController();
    setIsLoading(true);
    setHasError(false);
    setResult(NONE);

    loadInBatches(ids, id =>
      dataMartService.getInputSourceChangeImpact(id, {
        signal: abortController.signal,
        skipLoadingIndicator: true,
      })
    )
      .then(responses => {
        const visible = new Map<string, { id: string; title: string }>();
        let hidden = 0;
        for (const response of responses) {
          const named = (response.referencingDataMarts ?? []).filter(dm => !selected.has(dm.id));
          named.forEach(dm => visible.set(dm.id, dm));
          hidden += Math.max(
            0,
            (response.referencingDataMartsCount ?? 0) - (response.referencingDataMarts ?? []).length
          );
        }
        const dataMarts = [...visible.values()].sort((a, b) => a.title.localeCompare(b.title));
        setResult({ dataMarts, total: dataMarts.length + hidden });
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setHasError(true);
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [key, enabled]);

  return { ...result, isLoading, hasError };
}
