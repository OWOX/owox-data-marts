import { trackEvent } from './data-layer';

/**
 * A lazy chunk failed to load, typically a tab opened before a deploy asking
 * for a file the new build no longer ships. Message per browser: Chrome
 * "Failed to fetch dynamically imported module", Firefox "error loading
 * dynamically imported module", Safari "Importing a module script failed".
 */
const CHUNK_LOAD_ERROR = /dynamically imported module|Importing a module script failed/i;

export function isChunkLoadError(error: unknown): error is Error {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);
}

/**
 * Report a failed chunk import to analytics. `action` names the place that
 * caught it; the label keeps the browser message, which includes the chunk URL.
 * Returns whether the error was a chunk-load failure.
 */
export function trackChunkLoadError(error: unknown, action: string): boolean {
  if (!isChunkLoadError(error)) return false;
  trackEvent({
    event: 'chunk_load_error',
    category: 'App',
    action,
    label: error.message,
  });
  return true;
}
