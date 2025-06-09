import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Request, Response, NextFunction } from 'express';

export function setupStaticAssets(app: NestExpressApplication, pathPrefix: string): void {
  const distPath = join(__dirname, '..', '..', '..', 'web', 'dist');
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
