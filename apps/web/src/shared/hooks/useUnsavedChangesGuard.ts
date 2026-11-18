import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

export interface UnsavedChangesGuard {
  /** True while a navigation is held back and the member has not decided yet. */
  blocked: boolean;
  /** Let the held-back navigation through, discarding the unsaved edits. */
  confirmLeave: () => void;
  /** Cancel the navigation and stay on the page. */
  cancelLeave: () => void;
  /** True from the moment the blocker blocks, a render before `blocked` turns true, until the leave completes or is cancelled. */
  isLeavePending: () => boolean;
}

/**
 * Holds back an in-app navigation while a page has unsaved edits, and re-arms the browser's
 * own prompt for a hard reload or tab close.
 *
 * Deliberately *not* built on `useSchemaUnsavedGuard`: that hook is a save/discard workflow
 * over a `DataMartSchema` (registration, a schema resolved through save/discard, five call
 * intents), and generalising it would mean a type parameter threaded through `getSchema`,
 * `save`, `discard` and every caller, to reuse the ~20 lines below. A page that owns its
 * state and its save flow needs only those lines. For example, the connector builder keeps
 * the manifest in its own reducer, and its Save draft can fail with a message that belongs
 * in the top bar, not in a leave dialog. Both hooks sit on the same house primitive
 * (`useBlocker` + `beforeunload`), which is the part worth sharing.
 *
 * `useBlocker` requires a data router, so call this from the route layer, not from inside a
 * feature component that is also rendered standalone, such as the connector builder.
 */
export function useUnsavedChangesGuard(
  hasUnsavedChanges: () => boolean,
  leaves?: (nextPathname: string) => boolean
): UnsavedChangesGuard {
  // A getter, not a boolean: a navigation is decided synchronously the moment it is
  // requested, and a boolean routed through state lags a render behind. For example, the
  // connector builder's "Save draft created this connector, swap /new for /:id" navigation
  // happens in the same commit as the save that cleared the flag, so a lagging value blocks
  // it and asks the member about changes that were just saved.
  const isDirtyRef = useRef(hasUnsavedChanges);
  isDirtyRef.current = hasUnsavedChanges;

  const leavesRef = useRef(leaves);
  leavesRef.current = leaves;

  // `blocked` comes a render late and in a transition, so sync this only from committed state.
  const leavePendingRef = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const blocks =
      isDirtyRef.current() &&
      (leavesRef.current
        ? leavesRef.current(nextLocation.pathname)
        : currentLocation.pathname !== nextLocation.pathname);
    if (blocks) leavePendingRef.current = true;
    return blocks;
  });
  useLayoutEffect(() => {
    leavePendingRef.current = blocker.state !== 'unblocked';
  }, [blocker.state]);

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
    leavePendingRef.current = false;
    blocker.reset?.();
  }, [blocker]);

  const isLeavePending = useCallback(() => leavePendingRef.current, []);

  return { blocked: blocker.state === 'blocked', confirmLeave, cancelLeave, isLeavePending };
}
