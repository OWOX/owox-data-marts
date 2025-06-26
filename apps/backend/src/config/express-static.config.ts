import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Determines the correct path for web static assets based on execution mode
 */
function getWebDistPath(): string | null {
  const logger = new Logger('StaticAssets');

  const publishedPath = join(__dirname, '..', '..', 'public');
  const devPath = join(__dirname, '..', '..', '..', '..', 'web', 'dist');

  if (existsSync(publishedPath)) {
    logger.log(`Using published static assets: ${publishedPath}`);
    return publishedPath;
  }

  if (existsSync(devPath)) {
    logger.log(`Using development static assets: ${devPath}`);
    return devPath;
  }

  logger.log(`Static assets not found. Checked:\n  - ${publishedPath}\n  - ${devPath}`);

  return null;
}

/**
 * Configure express to serve static web assets
 */
export function setupStaticAssets(app: NestExpressApplication, pathPrefix: string): void {
  const distPath = getWebDistPath();

  if (!distPath) {
    return;
  }

  // Serve static files from Vite frontend (after build)
  app.useStaticAssets(distPath);

  // Handle SPA fallback for client-side routing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith(`/${pathPrefix}`)) {
      next();
    } else {
      res.sendFile(join(distPath, 'index.html'));
    }
  });
}
