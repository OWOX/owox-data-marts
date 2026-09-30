import { useEffect, useState } from 'react';
import { isLucideIconValue } from './lucide-icon-name';

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

interface LucideIconCatalogState {
  /** The catalogue, once loaded. */
  catalog: LucideIconCatalog | undefined;
  /** The last load failed (for example, the chunk is gone after a deploy). */
  failed: boolean;
}

/**
 * The full lucide catalogue, loaded on first need (it is a separate chunk).
 * `catalog` is `undefined` until it has loaded, or while `enabled` is false.
 * A failed load sets `failed`; turning `enabled` off and on again retries.
 */
export function useLucideIconCatalog(enabled = true): LucideIconCatalogState {
  const [catalog, setCatalog] = useState(loadedCatalog);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || catalog) return;
    let active = true;
    loadLucideIconCatalog().then(
      loaded => {
        if (!active) return;
        setCatalog(loaded);
        setFailed(false);
      },
      (error: unknown) => {
        console.error('Failed to load the icon library', error);
        if (active) setFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, [enabled, catalog]);

  return enabled ? { catalog, failed: failed && !catalog } : { catalog: undefined, failed: false };
}

const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

/**
 * Resolves once every `lucide:` icon among `icons` can be drawn: the catalogue
 * has loaded (or failed, and the glyphs fell back to the default icon) and the
 * glyphs have re-rendered. Call it before capturing the DOM, e.g. for an image export.
 */
export async function waitForDataMartIcons(
  icons: readonly (string | null | undefined)[]
): Promise<void> {
  if (!icons.some(icon => isLucideIconValue(icon))) return;
  try {
    await loadLucideIconCatalog();
  } catch {
    // The glyphs draw the default icon on a failed load; export that.
  }
  // Let the glyphs commit the loaded icons before the DOM is captured.
  await nextFrame();
  await nextFrame();
}
