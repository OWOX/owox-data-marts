import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backendTestRoot = __dirname;
const backendRoot = resolve(backendTestRoot, '../..');
const repoRoot = resolve(backendRoot, '../..');
const cliPackageRoots = [resolve(repoRoot, 'apps/owox'), resolve(repoRoot, 'apps/ctl')];

let prepared = false;

export function prepareCliManifests(): void {
  if (prepared) {
    return;
  }

  for (const packageRoot of cliPackageRoots) {
    withManifestLock(packageRoot, () => {
      const manifestPath = join(packageRoot, 'oclif.manifest.json');
      if (existsSync(manifestPath)) {
        return;
      }

      const result = spawnSync('npm', ['run', 'prepack'], {
        cwd: packageRoot,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
      });

      if (result.error || result.status !== 0) {
        throw new Error(
          `Failed to generate Oclif manifest in ${packageRoot}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
          { cause: result.error }
        );
      }
    });
  }

  prepared = true;
}

export function useCliManifests(): void {
  beforeAll(() => {
    prepareCliManifests();
  });
}

export function assertCliManifestsPrepared(): void {
  if (prepared) {
    return;
  }

  throw new Error(
    'API-key app smoke tests require Oclif manifests. Call useCliManifests() or prepareCliManifests() before starting the app or running owox-ctl.'
  );
}

function withManifestLock(packageRoot: string, callback: () => void): void {
  const lockKey = createHash('sha256').update(packageRoot).digest('hex').slice(0, 16);
  const lockPath = join(tmpdir(), `owox-cli-manifest-${lockKey}.lock`);
  const deadline = Date.now() + 60_000;

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (!isFileExistsError(error) || Date.now() >= deadline) {
        throw error;
      }
      wait(100);
    }
  }

  try {
    callback();
  } finally {
    rmSync(lockPath, { force: true, recursive: true });
  }
}

function isFileExistsError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === 'EEXIST'
  );
}

function wait(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
