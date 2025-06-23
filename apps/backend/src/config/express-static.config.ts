import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Determines the correct path for web static assets based on execution mode
 * @returns Path to web distribution files
 */
function getWebDistPath(): string {
  // For CLI bundle mode (when running via owox serve)
  // Static files are copied to the bundle directory as 'public'
  const bundleDistPath = join(__dirname, 'public');

  // For development mode (when running via npm run start:dev)
  // Static files are in the original web/dist location
  const devDistPath = join(__dirname, '..', '..', '..', 'web', 'dist');

  // Check if we're running from a bundle (CLI mode)
  if (existsSync(bundleDistPath)) {
    return bundleDistPath;
  }

  // Fallback to development path
  return devDistPath;
}

/**
 * Sets up static asset serving for the NestJS application
 * Supports both development mode and CLI bundle mode
 * @param app - NestJS Express application instance
 * @param pathPrefix - API path prefix to exclude from static serving
 */
export function setupStaticAssets(app: NestExpressApplication, pathPrefix: string): void {
  const distPath = getWebDistPath();

  // Serve static files from the determined web distribution path
  app.useStaticAssets(distPath);

  // Handle SPA fallback for client-side routing
  // Any request that doesn't start with the API prefix should serve index.html
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith(`/${pathPrefix}`)) {
      // API requests - continue to next middleware
      next();
    } else {
      // All other requests - serve the SPA entry point
      res.sendFile(join(distPath, 'index.html'));
    }
  });
}
