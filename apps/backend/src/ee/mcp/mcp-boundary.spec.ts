import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('EE MCP boundary', () => {
  const forbiddenPatterns = [
    'IdentityOwoxClient',
    '@owox/idp-owox-better-auth',
    'integrated-backend',
    '/idp/auth-flow/',
    '/api/idp/',
  ];

  it('does not import IDP provider or IB implementation details', () => {
    const root = join(__dirname);
    const files = collectTypeScriptFiles(root);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(source).not.toContain(pattern);
      }
    }
  });

  // The MCP SDK's registerTool rejects zod v3 schemas at runtime (a TypeError, not a type error —
  // `npm run lint`/`tsc` won't catch it), while every non-MCP file in this app stays on zod v3. A
  // stray `from 'zod'` here type-checks fine and only fails the moment that tool is registered,
  // taking down the whole /mcp endpoint on the first request after deploy. Catch it before deploy.
  it('imports the zod-v4 alias, never plain zod, for MCP schemas', () => {
    const root = join(__dirname);
    const files = collectTypeScriptFiles(root);
    const plainZodImport = /from\s+['"]zod['"]/;

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(plainZodImport);
    }
  });
});

function collectTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return collectTypeScriptFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}
