import express, { Express, NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Configuration options for static assets setup
 */
export interface StaticAssetsOptions {
  /** Array of route prefixes that should not trigger SPA fallback (e.g., ['/api', '/health']) */
  excludedRoutes?: string[];
  /** Name of the package containing static assets (default: '@owox/web') */
  packageName?: string;
}

/**
 * Configures Express application to serve static web interface files
 *
 * @param app - Express application instance
 * @param options - Configuration options for static assets and routing
 * @returns true if static assets were successfully configured, false if static files not found
 *
 * @example
 * ```typescript
 * const app = express();
 *
 * // Basic usage with defaults
 * const success = setupWebStaticAssets(app);
 *
 * // Advanced usage with custom configuration
 * const success = setupWebStaticAssets(app, {
 *   packageName: '@owox/web',
 *   excludedRoutes: ['/api', '/health', '/metrics']
 * });
 *
 * if (success) {
 *   console.log('Web interface is available');
 * }
 * ```
 */
export function setupWebStaticAssets(app: Express, options: StaticAssetsOptions = {}): boolean {
  const { packageName = '@owox/web' } = options;
  const distPath = getWebDistPath(packageName);

  if (!distPath) {
    return false;
  }

  // Serve static files
  app.use(express.static(distPath));

  // Configure SPA fallback for client-side routing
  setupSpaFallback(app, distPath, options);

  return true;
}

/**
 * Finds the path to the built static files of specified package
 * @param packageName - Name of the package containing static assets
 * @returns Path to the dist directory or null if not found
 */
function getWebDistPath(packageName: string): null | string {
  try {
    const require = createRequire(import.meta.url);

    // Try to find package through require.resolve
    const webPackagePath = require.resolve(`${packageName}/package.json`);
    const webPackageDir = path.join(webPackagePath, '..');
    const distPath = path.join(webPackageDir, 'dist');

    if (existsSync(distPath)) {
      return distPath;
    }

    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
}

/**
 * Sets up SPA fallback for client-side routing
 * @param app - Express application instance
 * @param distPath - Path to the static files directory
 * @param options - Configuration options for routing behavior
 */
function setupSpaFallback(app: Express, distPath: string, options: StaticAssetsOptions): void {
  const { excludedRoutes = ['/api'] } = options;

  // SPA fallback middleware - should be the last one!
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip excluded routes (API endpoints, health checks, etc.)
    const isExcludedRoute = excludedRoutes.some(route => req.path.startsWith(route));
    if (isExcludedRoute) {
      return next();
    }

    // Skip static files (with extensions)
    if (req.path.includes('.')) {
      return next();
    }

    // For all other routes, serve index.html (SPA routing)
    res.sendFile('index.html', { root: distPath }, error => {
      if (error) {
        next(error);
      }
    });
  });
}
