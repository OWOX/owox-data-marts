import { isRouteErrorResponse } from 'react-router';
import { trackEvent } from '../../utils/data-layer';

/** Stable classes only, so events group across builds: no messages, no chunk hashes. */
export type RouteErrorClass = 'dynamic_import' | 'css_preload' | 'http_4xx' | 'http_5xx' | 'other';

export type RouteErrorBoundaryName = 'LayoutErrorBoundary' | 'RootErrorBoundary';

// A lazy chunk failed to load. Chrome: "Failed to fetch dynamically imported
// module", Firefox: "error loading dynamically imported module", Safari:
// "Importing a module script failed".
const DYNAMIC_IMPORT = /dynamically imported module|Importing a module script failed/i;
// Vite preloads a chunk's CSS before the chunk itself and reports that first.
const CSS_PRELOAD = /^Unable to preload CSS/i;

export function classifyRouteError(error: unknown): RouteErrorClass {
  if (isRouteErrorResponse(error) || error instanceof Response) {
    if (error.status >= 500) return 'http_5xx';
    if (error.status >= 400) return 'http_4xx';
    return 'other';
  }
  if (error instanceof Error) {
    if (CSS_PRELOAD.test(error.message)) return 'css_preload';
    if (DYNAMIC_IMPORT.test(error.message)) return 'dynamic_import';
  }
  return 'other';
}

/**
 * One analytics event per error that renders a boundary screen. The boundaries
 * render nothing for a missing route (404), so that case is not counted.
 */
export function trackRouteError(error: unknown, boundary: RouteErrorBoundaryName): void {
  if (isRouteErrorResponse(error) && error.status === 404) return;
  trackEvent({
    event: 'route_error',
    category: 'App',
    action: boundary,
    label: classifyRouteError(error),
    context: window.location.pathname,
  });
}
