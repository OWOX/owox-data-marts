// packages/connectors/tests/buildBundleOnce.js
//
// `npm run build`'s `prebuild` step (`shx rm -rf dist`) recursively deletes,
// then vite rebuilds, `dist/`. When two test FILES each rebuild in their own
// `before()` hook — and Node's test runner executes separate test files
// concurrently by default (one child process per file) — a sibling's delete
// can remove `dist/index.cjs` in the gap between THIS process's own
// successful build and its subsequent `require()` of that file (TOCTOU on a
// directory shared across processes). A retry-on-failure alone does not
// close this: the build that gets deleted from under a reader can be a build
// that itself reported success.
//
// Fix: an exclusive, cross-process file lock (atomic `fs.mkdirSync`) held for
// the ENTIRE build+require critical section, released only once the module is
// safely parsed into the calling process's own require cache (in-memory —
// immune to any later on-disk deletion by a sibling). This fully serializes
// the hazardous section instead of racing and hoping; not a storage or
// SsrfGuard defect — every affected test's own assertions pass whenever the
// build+require sequence completes without interference.
//
// The lock path is scoped to this package's own root (see `selfPkgRoot`
// below) so unrelated checkouts/worktrees that happen to share `os.tmpdir()`
// never contend on (or reclaim) each other's lock, and it self-heals from a
// crashed/interrupted build (see `STALE_LOCK_MS` / `DEFAULT_ACQUIRE_TIMEOUT_MS`
// below) instead of wedging every subsequent `node --test` run behind a lock
// nobody is ever going to release.
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file always lives at `<pkgRoot>/tests/buildBundleOnce.js`, so its own
// location is a stable stand-in for "which package's dist/ this lock
// guards" — no need to thread pkgRoot through withBuildLock()'s callers, and
// two different checkouts/worktrees of this repo naturally get two different
// (stable) lock paths.
const selfPkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockScope = crypto.createHash('sha1').update(selfPkgRoot).digest('hex').slice(0, 8);
export const LOCK_PATH = path.join(os.tmpdir(), `owox-connectors-build-${lockScope}.lock`);
export const STALE_LOCK_MS = 120000; // guard against a lock orphaned by a killed/crashed process
// Must stay strictly greater than STALE_LOCK_MS. `acquireLockAt` below checks
// staleness BEFORE it ever checks this cap, and unconditionally reclaims once
// a lock's age crosses STALE_LOCK_MS — so as long as this stays bigger than
// STALE_LOCK_MS, a waiter is guaranteed to reach the reclaim branch before
// this cap can fire and throw.
//
// Reachability proof sketch: a waiter only ever observes EEXIST for a lock
// that already existed at (or before) its own `start`, so — for as long as
// the SAME lock instance is held — that lock's age is always >= this
// waiter's own elapsed wait. Once elapsed wait would exceed a timeoutMs that
// is itself >= STALE_LOCK_MS, age must already exceed STALE_LOCK_MS too, so
// the reclaim branch always fires first. This cap only matters as a
// last-resort backstop (e.g. pathological repeated lock hand-offs), never
// for a single orphaned/crashed lock. Deriving it from STALE_LOCK_MS (rather
// than a second, independent magic number) keeps that guarantee intact even
// if STALE_LOCK_MS is retuned later.
const DEFAULT_ACQUIRE_TIMEOUT_MS = STALE_LOCK_MS + 60000;

function sleepSync(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

/**
 * Core acquire loop, parameterized on the lock path (and, for tests only, the
 * staleness threshold) so tests can exercise the exact reclaim-vs-timeout
 * race at a fast, deterministic scale against a throwaway directory —
 * instead of the real, shared `LOCK_PATH` (which may legitimately be held by
 * a sibling test file's own in-progress build) and instead of waiting on the
 * real `STALE_LOCK_MS` (120s).
 * @param {string} lockPath
 * @param {number} timeoutMs
 * @param {number} [staleMs] defaults to the real `STALE_LOCK_MS`
 */
export function acquireLockAt(lockPath, timeoutMs, staleMs = STALE_LOCK_MS) {
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > staleMs) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // lock disappeared between the failed mkdir and this check — retry immediately
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`buildBundleOnce: timed out waiting for build lock at ${lockPath}`);
      }
      sleepSync(50);
    }
  }
}

function acquireLock(timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS) {
  acquireLockAt(LOCK_PATH, timeoutMs);
}

function releaseLock() {
  fs.rmSync(LOCK_PATH, { recursive: true, force: true });
}

/**
 * Runs `fn` while holding an exclusive cross-process lock, so `fn` (typically:
 * rebuild the dist bundle, then `require()` it) never overlaps a sibling test
 * file's own rebuild. See file header for why this is necessary.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withBuildLock(fn) {
  acquireLock();
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

/**
 * Runs `npm run build` for the package at `pkgRoot`. Callers MUST invoke this
 * (and any subsequent `require()` of dist output) inside `withBuildLock`.
 * @param {string} pkgRoot
 */
export function buildBundle(pkgRoot) {
  execFileSync('npm', ['run', 'build'], { cwd: pkgRoot, stdio: 'inherit' });
}
