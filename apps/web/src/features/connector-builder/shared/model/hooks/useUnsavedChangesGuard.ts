import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

export interface UnsavedChangesGuard {
  /** True while a navigation is held back waiting for the author to decide. */
  blocked: boolean;
  /** Let the held-back navigation through, discarding the unsaved edits. */
  confirmLeave: () => void;
  /** Cancel the navigation and stay on the page. */
  cancelLeave: () => void;
}

/**
 * Holds back an in-app navigation while a page has unsaved edits, and re-arms the browser's
 * own prompt for a hard reload or tab close.
 *
 * Deliberately *not* built on `useSchemaUnsavedGuard`: that hook is a save/discard workflow
 * over a `DataMartSchema` — registration, a schema resolved through save/discard, five call
 * intents — and generalising it would mean a type parameter threaded through `getSchema`,
 * `save`, `discard` and every caller, to reuse the ~20 lines below. The builder needs only
 * those lines, because the manifest is already in the builder's own reducer and its Save
 * draft can fail with a message that belongs in the top bar, not in a leave dialog. Both
 * hooks sit on the same house primitive (`useBlocker` + `beforeunload`), which is the part
 * worth sharing.
 *
 * `useBlocker` requires a data router, so this is used from the route layer rather than
 * from inside the builder feature component, which is also rendered standalone.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: () => boolean): UnsavedChangesGuard {
  // A getter, not a boolean: a navigation is decided synchronously the moment it is
  // requested, and a boolean routed through state lags a render behind. The builder's own
  // "Save draft created this connector, swap /new for /:id" navigation happens in the same
  // commit as the save that cleared the flag, so a lagging value blocks it and asks the
  // author about changes that were just saved.
  const isDirtyRef = useRef(hasUnsavedChanges);
  isDirtyRef.current = hasUnsavedChanges;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current() && currentLocation.pathname !== nextLocation.pathname
  );

  // Native prompt for a hard tab/window close or reload, which no router sees. Registered
  // for as long as the page is mounted and asks the getter when it fires, so it needs no
  // re-subscription as the page goes dirty and clean.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current()) return;
      event.preventDefault();
      // Safari / older Chromium still require returnValue to be set to show the prompt.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);

  const confirmLeave = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  const cancelLeave = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  return { blocked: blocker.state === 'blocked', confirmLeave, cancelLeave };
}
