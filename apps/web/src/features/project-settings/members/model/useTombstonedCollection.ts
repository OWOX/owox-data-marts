import { useCallback, useMemo, useRef } from 'react';

/**
 * Hook that pairs a collection of remote-state items with a self-evicting
 * tombstone set. Use it whenever the upstream API is eventually consistent —
 * after a successful DELETE/approve/decline, the next refresh() can still
 * return the freshly-removed item for several seconds. Without a tombstone,
 * the row reappears and the optimistic UI lies to the admin.
 *
 * Each call to `tombstone(id)` records "do not surface id again until upstream
 * stops returning it". `reconcile(upstream)` applies the filter AND drops any
 * tombstoned id the upstream no longer reports — so the set self-cleans
 * without needing TTLs or explicit reset.
 *
 * The returned object is referentially stable as long as `idOf` is stable —
 * crucial for callers that put the hook's return value in a `useCallback` /
 * `useEffect` dependency list. Without `useMemo` here, a fresh object on
 * every render re-fires effects and creates a refetch loop.
 */
export function useTombstonedCollection<T>(idOf: (item: T) => string) {
  const tombstones = useRef<Set<string>>(new Set());

  const tombstone = useCallback((id: string): void => {
    tombstones.current.add(id);
  }, []);

  const reconcile = useCallback(
    (upstream: T[]): T[] => {
      const set = tombstones.current;
      if (set.size === 0) return upstream;
      const upstreamIds = new Set(upstream.map(idOf));
      for (const id of [...set]) {
        if (!upstreamIds.has(id)) set.delete(id);
      }
      return set.size > 0 ? upstream.filter(item => !set.has(idOf(item))) : upstream;
    },
    [idOf]
  );

  return useMemo(() => ({ tombstone, reconcile }), [tombstone, reconcile]);
}
