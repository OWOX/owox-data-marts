import { useEffect, useState } from 'react';

type LucideIconCatalog = typeof import('./lucide-icon-catalog');

let loadedCatalog: LucideIconCatalog | undefined;
let pendingCatalog: Promise<LucideIconCatalog> | undefined;

/** Loads the full lucide catalogue once; a failed load is retried on the next call. */
export function loadLucideIconCatalog(): Promise<LucideIconCatalog> {
  pendingCatalog ??= import('./lucide-icon-catalog').then(
    catalog => (loadedCatalog = catalog),
    (error: unknown) => {
      pendingCatalog = undefined;
      throw error;
    }
  );
  return pendingCatalog;
}

/**
 * The full lucide catalogue, loaded on first need (it is a separate chunk).
 * Returns `undefined` until it has loaded, or while `enabled` is false.
 */
export function useLucideIconCatalog(enabled = true): LucideIconCatalog | undefined {
  const [catalog, setCatalog] = useState(loadedCatalog);

  useEffect(() => {
    if (!enabled || catalog) return;
    let active = true;
    loadLucideIconCatalog().then(
      loaded => {
        if (active) setCatalog(loaded);
      },
      (error: unknown) => {
        console.error('Failed to load the icon library', error);
      }
    );
    return () => {
      active = false;
    };
  }, [enabled, catalog]);

  return enabled ? catalog : undefined;
}
