/**
 * Web utilities module
 *
 * This module provides utilities for web interface integration,
 * including static file serving, SPA routing configuration, and helper routes.
 */

export { type FlagsRouteOptions, registerPublicFlagsRoute } from './flags-route.js';
export { registerHealthRoutes } from './health-route.js';
export { checkReadiness } from './readiness.js';
export { setupWebStaticAssets, type StaticAssetsOptions } from './static-config.js';
