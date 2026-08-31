/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { decodeResponse } from './decoders.js';
import { UnlimitedRateLimiter } from './rateLimiter.js';
import { isOpaque, unwrapOpaque } from './opaqueValue.js';
import { redactUrl } from '../AbstractSource.js';
import { LOG_LEVEL } from '../../Constants/CommonConstants.js';

/**
 * Builds and sends a single HTTP request from a templated request spec.
 * Responsibilities: interpolate path/query/headers/body, attach auth, validate
 * the final URL via SsrfGuard, send through the host's urlFetchWithRetry, and
 * return the decoded body. Pagination is layered on top by the retriever.
 */
export class Requester {
  /**
   * @param {object} deps
   * @param {string} deps.baseUrl
   * @param {{ urlFetchWithRetry: Function }} deps.httpClient
   * @param {import('./Authenticator.js').Authenticator} deps.auth
   * @param {import('./SsrfGuard.js').SsrfGuard} deps.ssrfGuard
   * @param {import('./TemplateEngine.js').TemplateEngine} deps.templateEngine
   * @param {import('../AbstractContext.js').AbstractContext} [deps.context] - run
   *   context; when provided, an errorHandler `IGNORE` that swallows a response is
   *   reported through it instead of vanishing (see the catch block in send()).
   * @param {string} [deps.nodeName] - the node this requester serves, for those logs
   */
  constructor({
    baseUrl,
    httpClient,
    auth,
    ssrfGuard,
    templateEngine,
    responseFormat = null,
    rateLimiter = new UnlimitedRateLimiter(),
    context = null,
    nodeName = null,
  }) {
    this.baseUrl = baseUrl;
    this.httpClient = httpClient;
    this.auth = auth;
    this.ssrfGuard = ssrfGuard;
    this.templateEngine = templateEngine;
    this.responseFormat = responseFormat;
    this.rateLimiter = rateLimiter;
    this.context = context;
    this.nodeName = nodeName;
  }

  /**
   * @param {object} requestSpec - { method, path?, url?, queryParameters?, headers?, body? }
   *   `url` (absolute) is used as-is (RequestPath from the paginator) instead of baseUrl+path,
   *   but is re-validated by SsrfGuard.
   * @param {object} scope - template scope
   * @param {{ withHeaders?: boolean }} [opts]
   *   When `withHeaders` is true returns `{ body, headers }` (raw response.headers);
   *   default returns the body unchanged (backward-compatible).
   * @returns {Promise<any>}
   */
  async send(requestSpec, scope, { withHeaders = false } = {}) {
    const method = (requestSpec.method || 'GET').toUpperCase();

    await this.rateLimiter.acquire();

    const query = this._renderOptionalMap(requestSpec.queryParameters, scope);
    const headers = this._renderOptionalMap(requestSpec.headers, scope);
    const req = { query, headers };
    await this.auth.prepare(scope, this.httpClient);
    this.auth.apply(req, scope);

    let urlObj;
    // A next page injected by the paginator with `inject.into: "path"` is a
    // location the UPSTREAM chose — which is exactly why it arrives marked
    // opaque. Its query string is part of that instruction, so the node's own
    // static queryParameters must not be written over it below: re-applying a
    // manifest `page=1` on top of the returned `page=2` re-requests page 1 for
    // every page, and since each identical page still returns records the loop
    // only ends at maxPages, having imported one page and reported COMPLETED.
    // Parameters the next URL does NOT carry are still applied, so an API key
    // or a static filter the upstream dropped from the link survives.
    //
    // The test is the opaque marker, not "did a paginator do this", because the
    // rule is the same wherever the target came from upstream: an AsyncRetriever
    // poll path is marked the same way and gets the same treatment.
    const followVerbatim = isOpaque(requestSpec.url) || isOpaque(requestSpec.path);
    const specUrl = unwrapOpaque(requestSpec.url);
    if (specUrl) {
      // RequestPath: an absolute next-page URL from the paginator. Bypasses
      // baseUrl+path but is re-validated by the SAME SsrfGuard below (host
      // allowlist + https + private-IP), so it cannot pivot off-host.
      urlObj = new URL(specUrl);
    } else {
      // An opaque path is a literal the upstream (or a prior render) already
      // produced — rendering it again would interpolate response data against a
      // scope holding every secret. The absolute-path check below still applies.
      const path = isOpaque(requestSpec.path)
        ? String(unwrapOpaque(requestSpec.path))
        : this.templateEngine.render(requestSpec.path || '', scope);
      // Defense in depth: a rendered path must be an absolute path. This prevents
      // user-controlled templates from altering the effective host via prefixes
      // like "@evil.com" or "//evil.com" before the SsrfGuard even runs.
      if (path && !path.startsWith('/')) {
        throw new Error(`Requester: rendered path must start with "/", got "${path.slice(0, 40)}"`);
      }
      urlObj = new URL(this.baseUrl + path);
    }
    for (const [k, v] of Object.entries(req.query)) {
      if (followVerbatim && urlObj.searchParams.has(k)) continue;
      urlObj.searchParams.set(k, v);
    }
    const finalUrl = urlObj.toString();

    await this.ssrfGuard.assertAllowed(finalUrl);

    const options = { method, headers: req.headers };
    if (requestSpec.body !== undefined && method !== 'GET') {
      options.body = JSON.stringify(this._renderDeep(requestSpec.body, scope));
      // Header names are case-INSENSITIVE on the wire, but a manifest `headers` map is a
      // plain object keyed exactly as the author typed it, so this default has to look for
      // any spelling. A case-sensitive `headers['Content-Type']` misses an author's
      // `"content-type"` and adds a SECOND key: undici merges duplicates into one
      // comma-joined value ("application/vnd.api+json, application/json"), which
      // media-type-strict APIs (JSON:API, vendor +json media types, most GraphQL gateways)
      // reject with 415 — and the manifest looks correct while it happens.
      //
      // Only the default needs this. Authenticator writes `inject.name` verbatim and
      // Paginator injects `inject.name` verbatim; neither reads a header back, so neither
      // can miss an author's casing.
      const hasContentType = Object.keys(options.headers).some(
        h => h.toLowerCase() === 'content-type'
      );
      if (!hasContentType) options.headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      // Thread the SAME allowlist guard as a per-hop validator so a redirect
      // cannot pivot the request off the manifest-allowed host (SSRF).
      const validate = nextUrl => this.ssrfGuard.assertAllowed(nextUrl);
      response = await this.httpClient.urlFetchWithRetry(finalUrl, options, validate);
    } catch (error) {
      if (error._declAction === 'IGNORE') {
        this._reportIgnored(error, requestSpec);
        return withHeaders ? { body: [], headers: error.response?.headers } : [];
      }
      throw error;
    }
    const body = await decodeResponse(response, this.responseFormat);
    return withHeaders ? { body, headers: response.headers } : body;
  }

  /**
   * Reports a response the node's errorHandler mapped to `action: "IGNORE"`.
   *
   * Swallowing the error is the configured action; swallowing it SILENTLY is not.
   * The empty page returned above stops the paginator for every pagination type
   * (Paginator.next() sees an empty/short page or an absent cursor), so a 500 on
   * page 5 of 50 returns pages 1-4, the node writes them, the account counts as
   * completed and the day is checkpointed. Without this line run history holds
   * nothing at all about the missing 90%: no log, and no `rows_extracted`
   * analytics either (that is only emitted when the count is > 0).
   *
   * INFO, not WARN, deliberately. WARN is not a severity in this system, it is
   * the run-failure channel: the backend maps LOG(warn) to
   * ConnectorMessageType.WARNING, pushes it into configErrors and demotes the
   * config to FAILED. A run failed by the very action the author asked for would
   * make `IGNORE` indistinguishable from `FAIL` in outcome, i.e. meaningless. An
   * author who wants a status to end the run already has `action: "FAIL"`.
   *
   * The target is REDACTED (origin + path only). This is a run log, persisted
   * and readable by anyone who can see run history including viewers — and with
   * `authentication.inject.into: "query"` the credential is in the query string
   * of the very URL named here: a next page arrives as the link the API sent
   * back, and APIs routinely echo the caller's own query parameters into it
   * (Graph's `paging.next` carries `access_token`). Redacting the whole query
   * rather than just `authentication.inject.name` is deliberate: this string is
   * upstream-authored, so it can also carry signatures and signed cursors the
   * manifest never declared and the engine cannot enumerate. Origin + path still
   * names the endpoint, which is all this message needs.
   */
  _reportIgnored(error, requestSpec) {
    if (!this.context?.log) return;
    const status = error.statusCode ? `HTTP ${error.statusCode}` : 'a request error';
    const where = this.nodeName ? `node "${this.nodeName}"` : 'the request';
    const raw = unwrapOpaque(requestSpec.url) || unwrapOpaque(requestSpec.path) || '';
    const target = raw ? redactUrl(raw) : '';
    this.context.log(
      LOG_LEVEL.INFO,
      `${status} on ${where} (${target}) matched an errorHandler IGNORE filter: this response was ` +
        `discarded and pagination stopped here, so records on this and any later page were NOT ` +
        `imported. Use action "FAIL" instead if this status should end the run.`
    );
  }

  /**
   * Query parameters and headers are where a manifest may legitimately reference
   * an OPTIONAL user parameter (e.g. a status filter the user left blank). An
   * absent value is simply not sent: that covers an unresolved template, a
   * literal null, and an empty string — a config form usually submits an
   * untouched optional field as "", which carries the same intent as omitting
   * it, and "status=" is rejected by plenty of APIs.
   *
   * path and body stay strict (see render calls below): a dropped path segment
   * would yield a malformed URL, and "omit" is ambiguous inside a nested body.
   * Auth headers are unaffected — Authenticator renders inject.format through
   * its own strict render and applies them after this map is built.
   */
  _renderOptionalMap(map, scope) {
    const out = {};
    for (const [k, v] of Object.entries(map || {})) {
      // A response-derived value (a pagination cursor) is substituted as a
      // literal instead of being rendered — see opaqueValue.js. The same
      // absent-value rule still applies to it.
      const rendered = isOpaque(v) ? unwrapOpaque(v) : this.templateEngine.renderOptional(v, scope);
      if (rendered === undefined || rendered === null || rendered === '') continue;
      out[k] = rendered;
    }
    return out;
  }

  _renderDeep(value, scope) {
    // Checked before the object branch below: an OpaqueValue IS an object, and
    // recursing into it would both expose its internals and lose the marker.
    if (isOpaque(value)) return unwrapOpaque(value);
    if (typeof value === 'string') return this.templateEngine.render(value, scope);
    if (Array.isArray(value)) return value.map(v => this._renderDeep(v, scope));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = this._renderDeep(v, scope);
      return out;
    }
    return value;
  }
}
