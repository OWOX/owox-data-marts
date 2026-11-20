/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// State reaches the connector process in an environment variable, which has a size limit.
export const SLICE_CHECKPOINT_MAX_BYTES = 8 * 1024;

/** FNV-1a 32-bit as 8 hex digits: pure JS, because Core is bundled without Node built-ins. */
export function sliceCheckpointHash(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The run's saved `sliceCheckpoint`, or an empty one when it is missing, malformed or another run's. */
export function readSliceCheckpoint(saved, runId) {
  const current = saved?.current;
  const wellFormed =
    typeof saved === 'object' &&
    saved !== null &&
    saved.runId === runId &&
    Array.isArray(saved.done) &&
    saved.done.every(scope => typeof scope === 'string') &&
    (current == null ||
      (typeof current.scope === 'string' &&
        typeof current.hash === 'string' &&
        Number.isInteger(current.slices) &&
        Number.isInteger(current.next) &&
        current.next >= 0 &&
        current.next <= current.slices));
  return wellFormed
    ? { runId, done: saved.done, current: current ?? null }
    : { runId, done: [], current: null };
}

/** Moves `scope` to `done`, unless that would pass SLICE_CHECKPOINT_MAX_BYTES: then a resume reads it again. */
export function finishSliceScope(checkpoint, scope) {
  if (checkpoint.done.includes(scope)) return { ...checkpoint, current: null };
  const finished = { ...checkpoint, done: [...checkpoint.done, scope], current: null };
  const bytes = new TextEncoder().encode(JSON.stringify(finished)).length;
  return bytes > SLICE_CHECKPOINT_MAX_BYTES ? { ...checkpoint, current: null } : finished;
}
