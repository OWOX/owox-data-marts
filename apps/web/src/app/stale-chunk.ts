let seen = false;

/** True once a lazy chunk failed to load: this tab runs a bundle from before a deploy. */
export function hasStaleChunk(): boolean {
  return seen;
}

/**
 * A tab opened before a deploy keeps running the previous bundle. The first
 * lazy chunk it asks for afterwards (the Models canvas, the Relationships
 * diagram) no longer exists on the server and the dynamic import rejects into
 * the route error boundary. Vite reports the failure on this event first, so
 * remember it and let the boundary explain instead of "Something went wrong".
 * Never reset: the tab stays stale until it is reloaded.
 */
export function watchForStaleChunk(): void {
  window.addEventListener('vite:preloadError', () => {
    seen = true;
  });
}
