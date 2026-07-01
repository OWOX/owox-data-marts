import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract test: OutputControlsCapabilityService is the source of truth for which
 * storages expose output controls. The web app (and the Google Sheets extension,
 * which lives in its own repo) mirror that set by hand. This test fails loudly if
 * the backend set and the web mirror drift apart, so adding a storage to one
 * without the other can't ship silently.
 *
 * It compares the `DataStorageType.<MEMBER>` tokens declared in each file's
 * `new Set([...])` as source text — no cross-app module resolution required, so a
 * jest (backend) test can read a vitest (web) source file without TS/path-alias
 * friction.
 */
const BACKEND_FILE = join(__dirname, 'output-controls-capability.service.ts');
const WEB_FILE = join(
  __dirname,
  '../../../../web/src/features/data-marts/shared/utils/output-controls-support.ts'
);

function extractSupportedMembers(filePath: string): Set<string> {
  let src: string;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(
      `Could not read ${filePath}. If the file moved, update this contract test's path.`
    );
  }
  const setMatch = src.match(/new Set\(\[([\s\S]*?)\]\)/);
  if (!setMatch) {
    throw new Error(`Could not find a "new Set([...])" declaration in ${filePath}`);
  }
  const members = setMatch[1].match(/DataStorageType\.(\w+)/g) ?? [];
  return new Set(members.map(m => m.replace('DataStorageType.', '')));
}

describe('output controls capability — FE/BE contract', () => {
  it('web mirror matches backend source of truth', () => {
    const backend = [...extractSupportedMembers(BACKEND_FILE)].sort();
    const web = [...extractSupportedMembers(WEB_FILE)].sort();
    expect(web).toEqual(backend);
  });

  it('parses a non-empty backend set (guards against a silently broken regex)', () => {
    expect(extractSupportedMembers(BACKEND_FILE).size).toBeGreaterThan(0);
  });
});
