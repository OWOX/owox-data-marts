/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getPath } from './pathUtils.js';

/**
 * Upper bound for any retry delay derived from a RESPONSE HEADER.
 *
 * Header-derived delays are the only backoff inputs an upstream server controls
 * (`constant`/`exponential` are manifest-authored, so their bounds are the
 * author's own). Unclamped they are a self-inflicted denial of service: the
 * connector runs in a child process whose `_delay` is a bare `setTimeout`, and
 * no wall-clock run deadline cuts it short -- the only AbortController in the
 * host fires on shutdown/cancel. `Retry-After: 2147483` therefore parks the
 * process, and the concurrency slot it holds, for 24.85 days. One second more
 * overflows the int32 `setTimeout` argument and collapses the wait to ~1ms, so
 * a merely huge value is maximally harmful while an absurd one is harmless --
 * both ends are wrong, and a ceiling fixes both.
 *
 * 5 minutes matches `Sources/GoogleSheets/Source.js`
 * (GOOGLE_SHEETS_MAX_RETRY_AFTER_MS), the same-package precedent for the same
 * header in the same long-running-import context. It comfortably clears the
 * rate-limit windows real APIs ask for (typically <= 60s) while bounding the
 * worst case to something an operator can wait out.
 */
export const MAX_HEADER_RETRY_DELAY_MS = 300000;

/**
 * Clamp a header-derived delay into [0, MAX_HEADER_RETRY_DELAY_MS].
 * Non-finite input yields null so callers fall through to their own backoff.
 * @param {number} ms
 * @returns {number|null}
 */
function clampHeaderDelay(ms) {
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(0, ms), MAX_HEADER_RETRY_DELAY_MS);
}

/**
 * Declarative per-node HTTP error policy. Matches a response (status code and,
 * when configured, the body) to a filter that yields an action, and computes a
 * retry delay from a backoff strategy. Consulted by DeclarativeSource (retry
 * decision + backoff) and the Requester (terminal IGNORE handling).
 */
export class ErrorHandler {
  /**
   * @param {{ responseFilters?: Array<object>, backoff?: object }} config
   */
  constructor(config = {}) {
    this.filters = Array.isArray(config.responseFilters) ? config.responseFilters : [];
    this.backoff = config.backoff || null;
  }

  /** True when any filter inspects the response body. */
  needsBody() {
    return this.filters.some(f => typeof f.messageContains === 'string' || f.bodyMatch);
  }

  /**
   * First filter whose every present condition holds, else null.
   * @param {number} statusCode
   * @param {string} bodyText
   * @param {any} bodyJson - parsed body, or null
   * @returns {object|null} the matched filter
   */
  match(statusCode, bodyText, bodyJson) {
    for (const f of this.filters) {
      const hasCodes = Array.isArray(f.httpCodes) && f.httpCodes.length > 0;
      const hasMsg = typeof f.messageContains === 'string';
      const hasBody = !!f.bodyMatch;
      if (!hasCodes && !hasMsg && !hasBody) continue; // empty filter never matches
      if (hasCodes && !f.httpCodes.includes(statusCode)) continue;
      if (hasMsg && !(typeof bodyText === 'string' && bodyText.includes(f.messageContains)))
        continue;
      if (hasBody) {
        const v = getPath(bodyJson, f.bodyMatch.path);
        if (v === undefined || v === null) continue;
        const s = String(v);
        if (f.bodyMatch.equals !== undefined && s !== f.bodyMatch.equals) continue;
        if (f.bodyMatch.contains !== undefined && !s.includes(f.bodyMatch.contains)) continue;
      }
      return f;
    }
    return null;
  }

  /**
   * Retry delay in ms for a matched filter (falling back to the handler-level
   * backoff), or null when no strategy applies.
   * @param {object|null} filter
   * @param {{ headers?: { get: Function } }|null} response
   * @param {number} attempt
   * @param {number} [initialDelay]
   * @returns {number|null}
   */
  delayMs(filter, response, attempt, initialDelay = 5000) {
    const spec = (filter && filter.backoff) || this.backoff;
    if (!spec) return null;
    switch (spec.type) {
      case 'constant':
        return Math.max(0, Number(spec.delayMs) || 0);
      case 'exponential': {
        const factor = Number.isFinite(spec.factor) ? spec.factor : 2;
        const base = Number.isFinite(spec.baseMs) ? spec.baseMs : initialDelay;
        return Math.max(0, Math.round(base * Math.pow(factor, attempt)));
      }
      case 'waitTimeFromHeader':
        return this._waitTimeFromHeader(spec, response);
      case 'waitUntilTimeFromHeader':
        return this._waitUntilTimeFromHeader(spec, response);
      default:
        return null;
    }
  }

  _waitTimeFromHeader(spec, response) {
    if (!response) return null;
    const headerName = (spec && spec.header) || 'Retry-After';
    const raw = response.headers?.get?.(headerName);
    if (raw == null) return null;
    const secs = Number(raw);
    if (Number.isFinite(secs)) return clampHeaderDelay(secs * 1000);
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) return clampHeaderDelay(dateMs - Date.now());
    return null;
  }

  _waitUntilTimeFromHeader(spec, response) {
    if (!response) return null;
    const raw = response.headers?.get?.(spec.header);
    if (raw == null) return null;
    let text = String(raw);
    if (spec.regex) {
      // Not a ReDoS sink: the PATTERN is manifest-authored and only the SUBJECT
      // comes from the response, so a catastrophic pattern can only burn the
      // authoring tenant's own run -- it crosses no privilege boundary. The
      // subject is a single HTTP header value, which the HTTP client caps well
      // below the size where backtracking on a sane pattern becomes interesting.
      const m = text.match(new RegExp(spec.regex));
      if (!m) return null;
      text = m[1] !== undefined ? m[1] : m[0];
    }
    const epochSec = Number(text);
    if (!Number.isFinite(epochSec)) return null;
    const minMs = Number.isFinite(spec.minMs) ? spec.minMs : 0;
    // The ceiling is applied AFTER the minMs floor, so it wins over it. `minMs`
    // is manifest-authored rather than server-sent, but manifests here are
    // written by users in the no-code builder, not by reviewed first-party code
    // -- letting a floor above the ceiling through would re-open the same
    // hold-the-slot problem by a different door.
    return clampHeaderDelay(Math.max(minMs, epochSec * 1000 - Date.now()));
  }

  // --- Backward-compatible API (status-code only; used by existing callers/tests) ---

  /** @param {number} statusCode @returns {'RETRY'|'IGNORE'|'FAIL'|null} */
  actionFor(statusCode) {
    for (const f of this.filters) {
      if (Array.isArray(f.httpCodes) && f.httpCodes.includes(statusCode)) return f.action;
    }
    return null;
  }

  /** @param {{ headers?: { get: Function } }|null} response @returns {number|null} */
  retryDelayMs(response) {
    if (!this.backoff || this.backoff.type !== 'waitTimeFromHeader') return null;
    return this._waitTimeFromHeader(this.backoff, response);
  }
}
