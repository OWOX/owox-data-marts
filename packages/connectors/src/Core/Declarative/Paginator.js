/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getPath, setPathSafe } from './pathUtils.js';
import { opaque } from './opaqueValue.js';

/**
 * Decides the next page request for a sync retriever, or null when paging is
 * done. Stateful — construct one per retriever run.
 *
 * Cursor source: config.cursor.from = 'body' (cursor.path) | 'header'
 *   (cursor.header, optional cursor.linkRel to parse <url>; rel="next").
 *   Legacy: config.cursorPath reads from the body.
 * Inject target: config.inject.into = 'query' (default; name from inject.name
 *   or the legacy *Param) | 'header' (inject.name) | 'body' (inject.path,
 *   deep-set) | 'path' (RequestPath: relative→request.path, absolute→request.url).
 * Stop: config.stopCondition { path, equals } halts when the body field matches;
 *   otherwise cursor-absent / short-page / empty-page defaults apply.
 *
 * Iteration budget: Paginator.next() itself never loops or sleeps, so it has
 * no independent runaway risk; the caller's driving loop (SyncRetriever's
 * `pages < maxPages`, default 10000) already bounds iterations for `cursor`
 * the same as `page`/`offset` — a cursor that never goes absent still stops
 * at maxPages, so no separate cursor-specific cap is needed here.
 */
export class Paginator {
  constructor(config = {}) {
    this.config = config || {};
    this.type = this.config.type || 'none';
    this._offset = 0;
    this._page = this.config.startPage ?? 1;
  }

  /** True when the cursor is read from a response header (SyncRetriever must surface headers). */
  needsHeaders() {
    return this.type === 'cursor' && this.config.cursor?.from === 'header';
  }

  next({ response, headers, request, recordCount }) {
    const stop = this.config.stopCondition;
    if (stop && this._stopMatches(response, stop)) return null;

    switch (this.type) {
      case 'cursor': {
        const cursor = this._readCursor(response, headers);
        if (cursor === undefined || cursor === null || cursor === '') return null;
        return this._inject(request, cursor);
      }
      case 'offset': {
        const pageSize = Number(this.config.pageSize);
        if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
        if (recordCount < pageSize) return null;
        this._offset += pageSize;
        return this._inject(request, this._offset);
      }
      case 'page': {
        if (recordCount === 0) return null;
        this._page += 1;
        return this._inject(request, this._page);
      }
      case 'none':
      default:
        return null;
    }
  }

  _stopMatches(response, stop) {
    const v = getPath(response, stop.path || []);
    if (v === undefined) return false;
    return v === stop.equals || String(v) === String(stop.equals);
  }

  _readCursor(response, headers) {
    const c = this.config.cursor;
    if (c?.from === 'header') {
      const raw = headers?.get?.(c.header);
      if (raw == null) return null;
      return c.linkRel ? this._parseLink(raw, c.linkRel) : raw;
    }
    return getPath(response, (c && c.path) || this.config.cursorPath || []);
  }

  _parseLink(linkHeader, rel) {
    for (const part of String(linkHeader).split(',')) {
      const m = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?([^";]+)"?/i);
      if (m && m[2].trim() === rel) return m[1].trim();
    }
    return null;
  }

  /**
   * Writes the next page's value into the request spec.
   *
   * Every value injected here is marked OPAQUE. A cursor is chosen by the
   * upstream, and the spec built here is handed straight back to the Requester,
   * which renders it against a scope holding every SECRET parameter and
   * `auth.token` — so an unmarked cursor of `"{{ parameters.ClientSecret }}"`
   * would render into the next request and ship the secret to the manifest
   * author's host. A page/offset counter is engine-computed rather than
   * upstream-controlled, but it is marked too: nothing injected here is ever a
   * template, so there is no case where rendering it is correct.
   */
  _inject(request, value) {
    const into = this.config.inject?.into || 'query';
    const name = this.config.inject?.name ?? this._legacyParam();
    switch (into) {
      case 'header':
        return {
          ...request,
          headers: { ...(request.headers || {}), [name]: opaque(String(value)) },
        };
      case 'body':
        // The raw value, NOT String(value): a body inject may legitimately need
        // to stay a number (e.g. a GraphQL `offset` variable).
        return {
          ...request,
          body: this._deepSet(request.body, this.config.inject?.path, opaque(value)),
        };
      case 'path': {
        const v = String(value);
        return /^https?:\/\//i.test(v)
          ? { ...request, url: opaque(v) }
          : { ...request, path: opaque(v) };
      }
      case 'query':
      default:
        return {
          ...request,
          queryParameters: { ...(request.queryParameters || {}), [name]: opaque(String(value)) },
        };
    }
  }

  _legacyParam() {
    if (this.type === 'cursor') return this.config.cursorParam;
    if (this.type === 'offset') return this.config.offsetParam;
    if (this.type === 'page') return this.config.pageParam;
    return undefined;
  }

  /**
   * Deep-sets `value` into a CLONE of `body` and returns the clone — the caller's
   * request object must stay untouched, because SyncRetriever hands the same spec
   * back for the next page. Unlike DeclarativeSource's in-place variant this one
   * also rejects an empty/non-array path: the injection target is the whole point
   * of `inject.into: "body"`, so there is no sensible default.
   */
  _deepSet(body, path, value) {
    if (!Array.isArray(path) || path.length === 0) {
      throw new Error('Paginator: body inject requires a non-empty path');
    }
    // The JSON round-trip would flatten an OpaqueValue left by the previous page
    // into a plain object, but it cannot matter: `path` is fixed for the life of
    // this Paginator, so the only marker the clone ever sees sits exactly where
    // setPathSafe is about to overwrite it with a fresh one.
    const root = body && typeof body === 'object' ? JSON.parse(JSON.stringify(body)) : {};
    setPathSafe(root, path, value, 'Paginator');
    return root;
  }
}
