import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a resource file path, checking `dist/resources` first,
 * then falling back to `src/resources`.
 */
export function resolveResourcePath(relativePath: string): string {
  const distPath = join(currentDir, '..', 'resources', relativePath);
  if (existsSync(distPath)) {
    return distPath;
  }

  const srcPath = join(currentDir, '..', '..', 'src', 'resources', relativePath);
  return srcPath;
}
