import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Determines the correct path for web static assets based on execution mode
 * @returns Path to web distribution files
 */
function getWebDistPath(): string {
  const logger = new Logger('StaticAssets');

  // For published CLI package - static files are in './public' relative to dist
  const publishedPath = join(__dirname, '..', 'public');

  // For development mode - static files are in web/dist
  const devPath = join(__dirname, '..', '..', '..', 'web', 'dist');

  // Check if we're running from published package
  if (existsSync(publishedPath)) {
    logger.log(`Using published static assets: ${publishedPath}`);
    return publishedPath;
  }

  // Fallback to development path
  if (existsSync(devPath)) {
    logger.log(`Using development static assets: ${devPath}`);
    return devPath;
  }

  throw new Error(`Static assets not found. Checked:\n  - ${publishedPath}\n  - ${devPath}`);
}

/**
 * Configure express to serve static web assets
 */
export function configureExpressStatic(app: NestExpressApplication): void {
  const webDistPath = getWebDistPath();

  // Serve static files from the web dist directory
  app.useStaticAssets(webDistPath);

  // Fallback for SPA routing: serve index.html for any non-API routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }

    // Skip requests for static assets (files with extensions)
    if (req.originalUrl.includes('.')) {
      return next();
    }

    // Serve the main index.html for SPA routing
    res.sendFile(join(webDistPath, 'index.html'));
  });
}
