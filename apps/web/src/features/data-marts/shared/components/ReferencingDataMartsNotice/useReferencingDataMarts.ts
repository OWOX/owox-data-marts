import { useEffect, useMemo, useState } from 'react';
import { dataMartService } from '../../services/data-mart.service';
import type { ReferencingDataMarts } from './ReferencingDataMartsNotice';

interface UseReferencingDataMartsResult extends ReferencingDataMarts {
  isLoading: boolean;
  /** The check failed for some of the Data Marts: their references are unknown, not absent. */
  hasError: boolean;
}

interface SettledCheck {
  /** The Data Marts the answer is for. */
  key: string;
  result: ReferencingDataMarts;
  hasError: boolean;
}

const NONE: ReferencingDataMarts = { dataMarts: [], total: 0 };

// A bulk delete on the canvas can cover dozens of Data Marts; ask about a few at a time.
const BATCH_SIZE = 5;

// Each id settles on its own: a selection can include a Data Mart the user may not check, and that
// must not hide what the others found.
async function loadInBatches<T>(
  ids: string[],
  load: (id: string) => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    results.push(...(await Promise.allSettled(ids.slice(index, index + BATCH_SIZE).map(load))));
  }
  return results;
}

/**
 * The SQL Data Marts that reference any of `dataMartIds`, other than those Data Marts themselves
 * (deleting several at once removes references between them too). Loads only while `enabled`, so
 * the check runs when a confirmation is on screen rather than on every visit.
 *
 * `isLoading` is true from the first render with `enabled` until the answer for these ids
 * arrives, so a confirmation can hold its action until the user has seen the answer.
 */
export function useReferencingDataMarts(
  dataMartIds: readonly string[],
  enabled: boolean
): UseReferencingDataMartsResult {
  const [settled, setSettled] = useState<SettledCheck | null>(null);
  const key = useMemo(() => [...dataMartIds].sort().join(','), [dataMartIds]);

  useEffect(() => {
    if (!enabled || !key) return;
    const ids = key.split(',');
    const selected = new Set(ids);
    const abortController = new AbortController();

    loadInBatches(ids, id =>
      dataMartService.getInputSourceChangeImpact(id, {
        signal: abortController.signal,
        skipLoadingIndicator: true,
      })
    )
      .then(results => {
        const visible = new Map<string, { id: string; title: string }>();
        let hidden = 0;
        let failed = false;
        for (const result of results) {
          if (result.status === 'rejected') {
            failed = true;
            continue;
          }
          const response = result.value;
          const named = (response.referencingDataMarts ?? []).filter(dm => !selected.has(dm.id));
          named.forEach(dm => visible.set(dm.id, dm));
          hidden += Math.max(
            0,
            (response.referencingDataMartsCount ?? 0) - (response.referencingDataMarts ?? []).length
          );
        }
        const dataMarts = [...visible.values()].sort((a, b) => a.title.localeCompare(b.title));
        if (!abortController.signal.aborted) {
          setSettled({
            key,
            result: { dataMarts, total: dataMarts.length + hidden },
            hasError: failed,
          });
        }
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setSettled({ key, result: NONE, hasError: true });
      });

    return () => {
      abortController.abort();
      // A closed confirmation drops its answer: reopened, it checks again.
      setSettled(null);
    };
  }, [key, enabled]);

  const active = enabled && key !== '';
  const current = active && settled?.key === key ? settled : null;
  return {
    ...(current?.result ?? NONE),
    isLoading: active && current === null,
    hasError: current?.hasError ?? false,
  };
}
