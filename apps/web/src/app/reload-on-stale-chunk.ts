const LAST_RELOAD_AT_KEY = 'owox:stale-chunk-reload-at';
/**
 * A second failure soon after a reload means the failure repeats on every load
 * (a broken build, a browser missing an API the chunk needs) — stop there.
 * The window starts at reload() and must outlast bootstrap plus the queries
 * that run before the canvas chunk is requested, so it is minutes, not seconds.
 */
const MIN_RELOAD_INTERVAL_MS = 5 * 60_000;

interface ReloadTarget {
  addEventListener: Window['addEventListener'];
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  location: Pick<Location, 'reload'>;
  now: () => number;
}

let isReloading = false;

/**
 * True from the moment a stale-chunk reload was requested until the page is
 * replaced. A stale load can fail more than once before the reload completes
 * (a chunk's CSS dependency, then the chunk itself), and a prevented event
 * still makes the dynamic import resolve to `undefined`, so an error can reach
 * the route error boundary. The boundary uses this to stay blank meanwhile.
 */
export function isReloadingForStaleChunk(): boolean {
  return isReloading;
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
    isReloading = true;
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
