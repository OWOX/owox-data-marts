import type { MouseEvent } from 'react';

/**
 * How long a click waits for the final link: the backend's own bound for the lookup it waits
 * for, so the fallback is a last resort rather than the likely outcome of a slow response.
 */
export const WAIT_FOR_LINK_MS = 15_000;

interface OpenLinkWhenResolvedOptions {
  /** Shown in the opened tab while it waits, so it does not look like a broken blank page. */
  waitingText?: string;
  timeoutMs?: number;
}

/**
 * A click handler for a link whose final target is still loading.
 *
 * The click opens the new tab at once, while the browser still counts it as the user's
 * action (a tab opened after an await would be blocked as a pop-up), and then sends that tab
 * to the resolved link. It goes to `fallback` when nothing resolves, the lookup fails, or after
 * `timeoutMs`. A modified click (new window, background tab) and a blocked pop-up keep the
 * anchor's own `fallback` link.
 */
export function openLinkWhenResolved(
  fallback: string,
  resolve: () => Promise<string | undefined>,
  {
    waitingText = 'Opening the link…',
    timeoutMs = WAIT_FOR_LINK_MS,
  }: OpenLinkWhenResolvedOptions = {}
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
    showWaiting(tab, waitingText);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(done => {
      timer = setTimeout(() => {
        done(undefined);
      }, timeoutMs);
    });
    void Promise.race([resolve().catch(() => undefined), timeout]).then(url => {
      clearTimeout(timer);
      navigateWithoutReferrer(tab, url ?? fallback);
    });
  };
}

function showWaiting(tab: Window, text: string): void {
  try {
    tab.document.title = text;
    tab.document.body.textContent = text;
  } catch {
    // A tab this page cannot write to stays blank; it is still sent on below.
  }
}

/**
 * Sends the tab on from its own document through a `rel="noreferrer"` link, as the anchor on
 * the page would: `tab.location.replace` called from this page would send this page's origin
 * as the Referer.
 */
function navigateWithoutReferrer(tab: Window, url: string): void {
  try {
    const link = tab.document.createElement('a');
    link.href = url;
    link.rel = 'noreferrer';
    tab.document.body.append(link);
    link.click();
  } catch {
    tab.location.replace(url);
  }
}
