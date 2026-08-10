import { useCallback, useEffect, useState } from 'react';
import { useProjectId } from '../../../shared/hooks';

export type PluginSort = 'default' | 'newest' | 'alphabetical';

/**
 * Gallery filters.
 *
 * Installation state (`installed` / `not_installed`) and audience (`project` /
 * `for_me`) are alternatives in one control: a member picks one view at a time.
 *
 * `project` means "anyone in this project can find it" — both project listings and
 * verified (deployment-wide) ones. Verified is not a separate filter: the trust mark
 * still shows on the card, but filtering by it would split the same project-available
 * set for no clear gain. `for_me` is personal listings only.
 */
export type PluginFilter = 'all' | 'installed' | 'not_installed' | 'project' | 'for_me';

export interface GalleryView {
  sort: PluginSort;
  filter: PluginFilter;
}

const DEFAULT_VIEW: GalleryView = { sort: 'default', filter: 'all' };

const SORTS = new Set<PluginSort>(['default', 'newest', 'alphabetical']);
const FILTERS = new Set<PluginFilter>(['all', 'installed', 'not_installed', 'project', 'for_me']);

/** Keyed by project: two projects rarely want the same view, and one must not leak into the other. */
const storageKey = (projectId: string) => `owox.plugins.gallery-view.${projectId}`;

function read(projectId: string | null): GalleryView {
  if (!projectId) {
    return DEFAULT_VIEW;
  }

  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) {
      return DEFAULT_VIEW;
    }

    // Validated rather than trusted: this value survives releases, so an option removed
    // in a later version must degrade to the default instead of filtering everything out.
    const parsed = JSON.parse(raw) as Partial<GalleryView>;
    const sort = parsed.sort;
    const filter = parsed.filter;

    return {
      sort: sort !== undefined && SORTS.has(sort) ? sort : DEFAULT_VIEW.sort,
      filter: filter !== undefined && FILTERS.has(filter) ? filter : DEFAULT_VIEW.filter,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

/**
 * Sort and filter choices for the Gallery, remembered per project.
 *
 * Not in the URL: this is a personal preference that should survive navigating away and
 * coming back, and a shared plugin link should open the recipient's own view rather than
 * the sender's.
 */
export function useGalleryView() {
  const projectId = useProjectId();
  const [view, setView] = useState<GalleryView>(() => read(projectId));

  // Switching projects has to re-read rather than carry the previous project's choice.
  useEffect(() => {
    setView(read(projectId));
  }, [projectId]);

  const update = useCallback(
    (patch: Partial<GalleryView>) => {
      setView(current => {
        const next = { ...current, ...patch };
        if (projectId) {
          try {
            localStorage.setItem(storageKey(projectId), JSON.stringify(next));
          } catch {
            // A full or disabled store costs the member their preference, nothing more.
          }
        }
        return next;
      });
    },
    [projectId]
  );

  return { view, update };
}
