import type { MouseEvent } from 'react';

/** How long a click waits for the final link before it opens the fallback. */
export const WAIT_FOR_LINK_MS = 5000;

/**
 * A click handler for a link whose final target is still loading.
 *
 * The click opens the new tab at once, while the browser still counts it as the user's
 * action (a tab opened after an await would be blocked as a pop-up), and then sends that tab
 * to the resolved link. It goes to `fallback` when nothing resolves or after `timeoutMs`.
 * A modified click (new window, background tab) and a blocked pop-up keep the anchor's own
 * `fallback` link.
 */
export function openLinkWhenResolved(
  fallback: string,
  resolve: () => Promise<string | undefined>,
  timeoutMs: number = WAIT_FOR_LINK_MS
): (event: MouseEvent<HTMLAnchorElement>) => void {
  return event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const tab = window.open('', '_blank');
    if (!tab) return;
    event.preventDefault();
    // The anchor is rel="noopener": the opened page must not reach back to this one either.
    tab.opener = null;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(done => {
      timer = setTimeout(() => {
        done(undefined);
      }, timeoutMs);
    });
    void Promise.race([resolve().catch(() => undefined), timeout]).then(url => {
      clearTimeout(timer);
      tab.location.replace(url ?? fallback);
    });
  };
}
