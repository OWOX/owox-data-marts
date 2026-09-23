const LAST_RELOAD_AT_KEY = 'owox:stale-chunk-reload-at';
/** A second failure right after a reload means the new build is broken too — stop there. */
const MIN_RELOAD_INTERVAL_MS = 10_000;

interface ReloadTarget {
  addEventListener: Window['addEventListener'];
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  location: Pick<Location, 'reload'>;
  now: () => number;
}

/**
 * A tab opened before a deploy keeps running the previous bundle. The first
 * lazy chunk it asks for afterwards (the Models canvas, the Relationships
 * diagram) no longer exists on the server, the dynamic import rejects, and the
 * route error boundary shows "Something went wrong". Vite reports the failed
 * import on this event; reloading picks up the current index.html.
 */
export function reloadOnStaleChunk(target: ReloadTarget = browserTarget()): void {
  target.addEventListener('vite:preloadError', event => {
    const lastReloadAt = Number(target.sessionStorage.getItem(LAST_RELOAD_AT_KEY) ?? 0);
    if (target.now() - lastReloadAt < MIN_RELOAD_INTERVAL_MS) return;
    target.sessionStorage.setItem(LAST_RELOAD_AT_KEY, String(target.now()));
    event.preventDefault();
    target.location.reload();
  });
}

function browserTarget(): ReloadTarget {
  return {
    addEventListener: window.addEventListener.bind(window),
    sessionStorage: window.sessionStorage,
    location: window.location,
    now: Date.now,
  };
}
