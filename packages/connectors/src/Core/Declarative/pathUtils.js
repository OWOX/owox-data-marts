/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Walks an array path of keys into an object, returning the value or undefined.
 * Shared by Paginator, AsyncRetriever, and Authenticator. Defined once so the
 * flat Vite bundle (which concatenates all Core files into one scope) has a
 * single `getPath` declaration.
 */
export function getPath(obj, path) {
  let v = obj;
  for (const k of path || []) v = v == null ? undefined : v[k];
  return v;
}

/**
 * Segments that must never appear in a manifest-supplied WRITE path. Assigning
 * through `__proto__` (or walking into `constructor.prototype`) reaches
 * `Object.prototype`, so a single deep-set turns into process-wide prototype
 * pollution — and the value written is frequently upstream-controlled (a
 * pagination cursor), not just manifest-controlled.
 *
 * Read paths (getPath) do not need this: reading `__proto__` returns a
 * prototype, it does not modify one.
 */
const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Rejects a manifest write path that could reach `Object.prototype`. Used at
 * parse time (fail at publish) and again inside setPathSafe (fail at run) so a
 * model built without the parser is still guarded.
 *
 * @param {string[]} path
 * @param {string} label - prefix identifying the call site in the error message
 * @throws when any segment is unsafe
 */
export function assertSafePathSegments(path, label) {
  for (const k of path || []) {
    if (UNSAFE_PATH_SEGMENTS.has(k)) {
      throw new Error(`${label}: unsafe key "${k}" in manifest path`);
    }
  }
}

/**
 * Walks `path` into `target`, creating plain objects for missing or
 * non-object intermediates, and assigns `value` at the last segment.
 *
 * Deliberately narrow: it MUTATES `target` in place and returns nothing, and it
 * does NOT validate the shape of `path` (empty/non-array handling belongs to the
 * caller, whose contract differs). The one thing it always does is reject unsafe
 * segments — before any mutation, so a rejected path leaves `target` untouched.
 *
 * @param {object} target - mutated in place
 * @param {string[]} path
 * @param {*} value
 * @param {string} [label] - prefix identifying the call site in the error message
 * @returns {void}
 */
export function setPathSafe(target, path, value, label = 'setPathSafe') {
  assertSafePathSegments(path, label);
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[path[path.length - 1]] = value;
}
