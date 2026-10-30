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
