// packages/connectors/tests/buildBundleOnce.test.js
//
// Unit-level checks for buildBundleOnce.js's lock mechanics:
//   1. (scaled-constants repro) a waiter watching a lock that starts FRESH
//      and ages into staleness WHILE it waits successfully reaches the
//      reclaim branch, as long as timeoutMs > staleMs — the exact race the
//      real bug was about, run at a fast/deterministic scale instead of the
//      real STALE_LOCK_MS (120s);
//   2. (control) the same race with the ORIGINAL buggy relationship
//      (timeoutMs < staleMs) reproduces the bug: the waiter times out before
//      the lock is ever considered stale. This confirms tests (1)/(2) aren't
//      vacuously true — the harness genuinely distinguishes the two cases;
//   3. (real constants) an already-stale lock is reclaimed immediately, and
//      a fresh lock is left alone (the mutex still works for legitimate
//      in-progress builds under the real STALE_LOCK_MS);
//   4. the lock path is scoped to this package's root, not a fixed
//      cross-checkout shared name.
//
// All of these exercise `acquireLockAt` directly against throwaway lock
// directories — never the real, shared `LOCK_PATH` — so this file is always
// safe to run standalone or alongside the suites
// that hold the real lock for actual builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acquireLockAt, LOCK_PATH, STALE_LOCK_MS } from './buildBundleOnce.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function throwawayLockPath(label) {
  return path.join(os.tmpdir(), `owox-connectors-lock-test-${label}-${process.pid}-${Date.now()}`);
}

test('reclaim race: a lock that ages past staleMs WHILE a waiter waits is reclaimed, when timeoutMs > staleMs (the fixed relationship)', () => {
  const lockPath = throwawayLockPath('race-fixed');
  fs.mkdirSync(lockPath); // fresh — the waiter must watch this age in real time

  try {
    const start = Date.now();
    // Scaled-down stand-in for STALE_LOCK_MS=120000 / DEFAULT_ACQUIRE_TIMEOUT_MS=180000:
    // same shape (timeoutMs > staleMs), 1000x smaller, so the test finishes in ~150ms
    // instead of minutes.
    acquireLockAt(lockPath, /* timeoutMs */ 600, /* staleMs */ 150);
    const elapsed = Date.now() - start;

    assert.ok(fs.existsSync(lockPath), 'expected the reclaimed lock to be held afterward');
    // Must have actually waited for the lock to age past staleMs (not an
    // instant reclaim like the already-stale case below) ...
    assert.ok(elapsed >= 50, `expected to wait through at least one poll cycle, took ${elapsed}ms`);
    // ... but well within the overall safety cap.
    assert.ok(elapsed < 600, `expected to reclaim before the timeoutMs cap, took ${elapsed}ms`);
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
});

test('control: with the ORIGINAL buggy relationship (timeoutMs < staleMs), the waiter times out before the lock is ever considered stale', () => {
  const lockPath = throwawayLockPath('race-buggy');
  fs.mkdirSync(lockPath); // fresh — same setup as above

  try {
    // Same scenario as the fixed-relationship test above, but with staleMs
    // and timeoutMs swapped to mirror the ORIGINAL bug (STALE_LOCK_MS=120000,
    // default timeoutMs=60000 < STALE_LOCK_MS). Demonstrates the bug
    // reproduces under this shape, and that the test above is not vacuous.
    assert.throws(
      () => acquireLockAt(lockPath, /* timeoutMs */ 150, /* staleMs */ 600),
      /timed out waiting for build lock/
    );
    // The lock was never reclaimed — it was never old enough (600ms) to be
    // considered stale within the 150ms this waiter was willing to wait.
    assert.ok(fs.existsSync(lockPath));
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
});

test('real constants: an already-stale lock (age > STALE_LOCK_MS) is reclaimed immediately', () => {
  const lockPath = throwawayLockPath('already-stale');
  fs.mkdirSync(lockPath);
  const staleMtime = new Date(Date.now() - (STALE_LOCK_MS + 5000));
  fs.utimesSync(lockPath, staleMtime, staleMtime);

  try {
    const start = Date.now();
    acquireLockAt(lockPath, 1000); // staleMs defaults to the real STALE_LOCK_MS
    const elapsed = Date.now() - start;

    assert.ok(fs.existsSync(lockPath), 'expected the reclaimed lock to be held afterward');
    assert.ok(
      elapsed < 1000,
      `expected a near-instant reclaim (no polling needed), took ${elapsed}ms`
    );
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
});

test('real constants: a fresh lock is NOT reclaimed, and a short-timeout waiter times out waiting for it', () => {
  const lockPath = throwawayLockPath('fresh');
  fs.mkdirSync(lockPath); // fresh mtime — nowhere near STALE_LOCK_MS old

  try {
    assert.throws(() => acquireLockAt(lockPath, 200), /timed out waiting for build lock/);
    // Still there — a fresh lock must never be reclaimed out from under
    // whoever legitimately holds it.
    assert.ok(fs.existsSync(lockPath));
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
});

test('LOCK_PATH is scoped to this package root, not a fixed cross-checkout name', () => {
  const pkgRoot = path.resolve(__dirname, '..');
  const expectedScope = crypto.createHash('sha1').update(pkgRoot).digest('hex').slice(0, 8);

  assert.equal(path.dirname(LOCK_PATH), os.tmpdir());
  assert.equal(path.basename(LOCK_PATH), `owox-connectors-build-${expectedScope}.lock`);
});
