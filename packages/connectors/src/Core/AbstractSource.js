/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { TraceEvent } from './Events/TraceEvent.js';
import { LOG_LEVEL, DATE_STRATEGY } from '../Constants/CommonConstants.js';

export class AbstractSource {
  constructor(context) {
    if (!context) throw new Error('context is required');
    this.context = context;
    // Subclasses set this.parameters and this.fieldsSchema in their constructor
    // then context.registerParameters(this.parameters, 'source') is called
  }

  // --- Hook defaults (override in subclasses) ---

  /**
   * Parse field selections from config. Default: split space-separated CSV into { nodeName: [fields] }.
   */
  parseFields(context) {
    const fieldsValue = context.getParameter('Fields');
    if (!fieldsValue || !fieldsValue.value) return {};
    return this._parseFieldsString(fieldsValue.value);
  }

  /**
   * Default field parser. Matches project convention used by backend and existing
   * ConnectorUtils.parseFields / FormatUtils.parseFields.
   *
   * Input format: "nodeName fieldName, nodeName fieldName, ..."
   *   - delimiter between entries: comma followed by optional whitespace
   *   - separator between node and field: single space
   *
   * Example:
   *   "observations/group date, observations/group label, observations/group rate"
   *   → { "observations/group": ["date", "label", "rate"] }
   *
   * @param {string} fieldsString
   * @returns {Record<string, string[]>}
   */
  _parseFieldsString(fieldsString) {
    if (typeof fieldsString !== 'string' || fieldsString.length === 0) {
      return {};
    }

    const result = {};
    const items = fieldsString
      .split(/,\s*/)
      .map(s => s.trim())
      .filter(Boolean);

    for (const item of items) {
      // First space separates node name from field name. Node names may contain
      // characters like "/" (e.g., "observations/group") — only the first space
      // is the separator.
      const spaceIdx = item.indexOf(' ');
      if (spaceIdx <= 0) continue;

      const node = item.slice(0, spaceIdx).trim();
      const field = item.slice(spaceIdx + 1).trim();
      if (!node || !field) continue;

      if (!result[node]) result[node] = [];
      if (!result[node].includes(field)) result[node].push(field);
    }

    return result;
  }

  /**
   * Return list of accounts to iterate. Default: [null] (no account iteration).
   * Subclasses override to parse multi-account configs (CustomerId, AccountIDs, URNs, etc.).
   */
  getAccounts(context) {
    return [null];
  }

  /**
   * Return date strategy for time-series nodes.
   * 'day-by-day' (default), 'range', or 'none'.
   */
  getDateStrategy(nodeName) {
    return DATE_STRATEGY.DAY_BY_DAY;
  }

  /**
   * Called after all nodes for an account are processed.
   */
  onAccountComplete(account) {
    // no-op by default
  }

  /**
   * Called when an account processing fails.
   */
  onAccountError(account, error) {
    // no-op by default — AbstractConnector logs the error
  }

  /**
   * Called after all accounts and nodes are done.
   */
  onImportComplete(context) {
    // no-op by default
  }

  /**
   * Get destination table name for a node.
   * Honors DestinationTableNameOverride config; falls back to schema.destinationName.
   */
  getDestinationName(nodeName, nodeSchema) {
    const override = this.context.getParameter('DestinationTableNameOverride');
    if (override && override.value) {
      // Override format: "NodeA TableA, NodeB TableB" — entries comma-separated, the
      // node name and its table separated by a single space (same shape as the
      // per-node Fields config). Return the table for the requested node if present.
      const match = String(override.value)
        .split(',')
        .map(s => s.trim())
        .find(s => s.startsWith(nodeName + ' '));
      if (match) {
        return match.slice(nodeName.length).trim();
      }
    }
    return (nodeSchema && nodeSchema.destinationName) || nodeName;
  }

  /**
   * Abstract: fetch data for a node.
   * @returns {Promise<object[]>}
   */
  async fetchData({ nodeName, fields, accountId, startDate, endDate }) {
    throw new Error('fetchData() must be implemented by subclass');
  }

  /**
   * Get fields schema, filtered to nodes with fields.
   */
  getFieldsSchema() {
    const schema = {};
    for (const [name, node] of Object.entries(this.fieldsSchema || {})) {
      if (
        node.fields &&
        (Array.isArray(node.fields) ? node.fields.length > 0 : Object.keys(node.fields).length > 0)
      ) {
        schema[name] = node;
      }
    }
    return schema;
  }

  // --- OAuth (kept for compatibility with existing Sources) ---

  async exchangeOauthCredentials(credentials, variables) {
    throw new Error('exchangeOauthCredentials() must be implemented by subclass');
  }

  async refreshCredentials(configuration, credentials, variables) {
    return null;
  }

  // --- HTTP with retry (native fetch) ---

  // Redirect statuses fetch surfaces as a 3xx Response under redirect:'manual'.
  static REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
  // Max Location hops we will follow before giving up (matches browser defaults).
  static MAX_REDIRECT_HOPS = 5;
  // Headers that carry a credential and must not survive a hop to another
  // origin. Compared lower-cased; the caller's own casing is preserved.
  static CREDENTIAL_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'cookie2',
  ]);

  /**
   * Wraps native fetch with retry logic. Returns native Response object.
   *
   * Redirect handling is chosen by whether a `validate` callback is supplied:
   * - WITH `validate` (declarative egress): redirects are followed MANUALLY
   *   (redirect:'manual', hop-capped at MAX_REDIRECT_HOPS) so each `Location` is
   *   re-validated via `await validate(nextUrl)` before the hop is taken. This is
   *   the SSRF egress boundary — a server cannot 30x us onto an internal host past
   *   the initial allowlist check.
   * - WITHOUT `validate` (bundled Sources, hardcoded provider URLs): redirects are
   *   delegated to undici's transparent follow (redirect:'follow', ~20 hops +
   *   automatic 303→GET), preserving those Sources' pre-remediation behavior.
   *
   * @param {string} url
   * @param {object} [options] - fetch options; `redirect` is set per the rule above.
   * @param {(nextUrl: string) => (void | Promise<void>)} [validate]
   *   Per-hop SSRF validator (Requester passes SsrfGuard.assertAllowed; async
   *   download + token exchange pass SsrfGuard.assertPublicHttps). When omitted,
   *   redirects use undici's default transparent follow.
   */
  async urlFetchWithRetry(url, options = {}, validate) {
    let maxRetries = this._getRetryParam('MaxFetchRetries', 3);
    let initialDelay = this._getRetryParam('InitialRetryDelay', 5000);

    // In a live "Test" run (OW_TEST), keep retries snappy: full exponential
    // backoff (e.g. 5s→10s→20s) easily exceeds the test timeout, so the user/AI
    // sees "timed out" instead of the real cause. Cap to one short retry so a
    // genuine failure surfaces fast WITH its diagnostic. Real runs keep the budget.
    // `maxRetries` is now a TOTAL-attempts count (see below), so "one retry"
    // means 2 total attempts, not 1.
    if (process.env.OW_TEST) {
      maxRetries = Math.min(maxRetries, 2);
      initialDelay = Math.min(initialDelay, 500);
    }

    // `MaxFetchRetries` is main-parity: it's the TOTAL number of HTTP attempts
    // (initial try + retries), not the retry count on top of an initial try.
    // main's loop was `for (attempt = 1; attempt <= MaxFetchRetries; attempt++)`
    // with `_shouldRetry` bailing once `attempt >= MaxFetchRetries` — i.e. for
    // MaxFetchRetries=3, exactly 3 total attempts (2 retries). Floor at 1 so a
    // misconfigured `MaxFetchRetries: 0` still makes a single attempt instead
    // of silently making zero requests and resolving `undefined`.
    const totalAttempts = Math.max(maxRetries, 1);

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      try {
        // `currentUrl`/`currentOptions` advance across this attempt's redirect
        // hops and are re-initialised PER ATTEMPT: a retry must re-issue the
        // original request, not resume from wherever the failed attempt's last
        // hop landed (which would also inherit that hop's stripped headers and
        // silently retry a different URL). The hop budget resets with them.
        let currentUrl = url;
        let currentOptions = options;
        let hops = 0;
        let response;
        // Redirect handling depends on whether a per-hop validator was supplied.
        // Declarative egress passes `validate` → follow redirects MANUALLY so each
        // hop is SSRF-re-validated (a server cannot 30x us onto an internal host).
        // Bundled Sources pass no validator (hardcoded provider URLs, no SSRF
        // surface) → delegate to undici's transparent follow ('follow': ~20 hops +
        // automatic 303→GET), preserving their pre-remediation behavior.
        const redirectMode = validate ? 'manual' : 'follow';
        // Manual-redirect loop. Each iteration issues one request; a 3xx with a
        // Location advances currentUrl (after re-validation) and loops. Under
        // 'follow', undici resolves all hops itself, so we issue one request and stop.
        while (true) {
          // Redact the URL before it enters the trace: query strings commonly
          // carry credentials (?app_id=SECRET, ?token=…), and the trace is
          // persisted to run logs. Keep origin+path for diagnosis.
          this.context.emit(
            new TraceEvent('http_request', { url: this._redactUrl(currentUrl), attempt })
          );
          response = await fetch(currentUrl, { ...currentOptions, redirect: redirectMode });

          // Bundled Sources delegate redirect following to undici — never run our
          // manual hop loop for them.
          if (redirectMode === 'follow') break;

          if (!AbstractSource.REDIRECT_STATUSES.has(response.status)) break;

          const location = response.headers.get('location');
          if (!location) break; // 3xx without a Location: treat as a terminal response

          if (hops >= AbstractSource.MAX_REDIRECT_HOPS) {
            throw Object.assign(
              new Error(
                `Too many redirects (>${AbstractSource.MAX_REDIRECT_HOPS}) starting from ${this._redactUrl(url)}`
              ),
              { _redirectControl: true }
            );
          }
          const nextUrl = new URL(location, currentUrl).toString();
          if (validate) {
            // SSRF re-validation of the hop. A rejection here is a security
            // decision, not a transient error — mark it so the retry path below
            // rethrows it immediately instead of retrying/mangling the message.
            try {
              await validate(nextUrl);
            } catch (e) {
              throw Object.assign(e instanceof Error ? e : new Error(String(e)), {
                _redirectControl: true,
              });
            }
          }
          currentOptions = AbstractSource._optionsForHop(
            currentOptions,
            currentUrl,
            nextUrl,
            response.status
          );
          currentUrl = nextUrl;
          hops++;
        }

        if (!response.ok) {
          // Capture a snippet of the error body — it usually carries the real API
          // reason (e.g. {"error":"invalid_token"}), which the bare status hides.
          const bodyText =
            typeof response.text === 'function' ? await response.text().catch(() => '') : '';
          const snippet = bodyText ? ` — ${bodyText.slice(0, 300)}` : '';
          const error = new Error(`HTTP ${response.status}: ${response.statusText}${snippet}`);
          error.response = response;
          error.statusCode = response.status;
          error.responseBody = bodyText;
          // Best-effort: attach the parsed JSON error body as `.payload`, restoring
          // main's contract that Source.isValidToRetry() overrides (e.g. FacebookMarketing)
          // rely on to inspect provider-specific error codes. A non-JSON body is left
          // unset -- `.responseBody` (raw text) already covers that case.
          try {
            error.payload = JSON.parse(bodyText);
          } catch {
            // non-JSON body -- leave error.payload unset
          }

          if ((await this.isValidToRetry(error)) && attempt < totalAttempts - 1) {
            const delay = this.calculateBackoff(attempt, initialDelay);
            // INFO, not WARN, and main logged it through config.logMessage() too.
            // A retry notice describes a transient condition the engine is about
            // to recover from -- it is not a run outcome. The backend translates
            // LOG(warn) into ConnectorMessageType.WARNING, pushes it into
            // configErrors and then demotes the config with
            // `if (success && configErrors.length > 0) success = false`, so at
            // WARN a single 503 that the very next attempt fixed would fail a
            // complete, correct import. Retries that ultimately EXHAUST still
            // fail the run -- the error is thrown below.
            this.context.log(
              LOG_LEVEL.INFO,
              `Request failed (${response.status} ${response.statusText})${snippet}, retrying in ${delay}ms (attempt ${attempt + 1}/${totalAttempts})`
            );
            await this._delay(delay);
            continue;
          }
          // Never downgrade a flag a deeper layer already set: it classified with more
          // context than the status code available here, so its `true` wins. A `false`
          // from below only means "not one of the cases I recognise", so a genuine
          // 401/403 can still promote it.
          error.isWarning = error.isWarning || this._isAuthError(error);
          throw error;
        }

        return response;
      } catch (error) {
        // Redirect-control errors (too-many-redirects, a per-hop validate
        // rejection) are deterministic security/limit decisions — never retry or
        // rewrite them; propagate as-is.
        if (error && error._redirectControl) throw error;

        // HTTP errors are fully decided in the try block (retried there if retryable,
        // thrown here if not). Don't re-evaluate retry logic for them in the catch path.
        if (error.response) throw error;

        // A native fetch failure is a TypeError("fetch failed") whose real reason
        // (DNS/connection) hides in error.cause — surface it in logs and the thrown error.
        const detail = this._describeFetchError(error);
        if (attempt >= totalAttempts - 1) {
          if (error && typeof error === 'object') {
            error.message = detail;
            error.isWarning = error.isWarning || this._isAuthError(error);
          }
          throw error;
        }

        if (await this.isValidToRetry(error)) {
          const delay = this.calculateBackoff(attempt, initialDelay);
          // INFO for the same reason as the HTTP retry notice above: a recovered
          // network blip must not be classified as a run failure by the backend.
          this.context.log(LOG_LEVEL.INFO, `Request error: ${detail}, retrying in ${delay}ms`);
          await this._delay(delay);
        } else {
          if (error && typeof error === 'object') {
            error.message = detail;
            error.isWarning = error.isWarning || this._isAuthError(error);
          }
          throw error;
        }
      }
    }
  }

  /**
   * The fetch options to use for the next redirect hop.
   *
   * Following a `Location` blindly replays the request the server ASKED us to
   * replay. Two adjustments make that safe:
   *
   * - A 303 means "fetch the result with GET" (RFC 9110 §15.4.4): the method
   *   becomes GET and the body is dropped. Without this a `303` on the token
   *   endpoint re-POSTed `grant_type=…&client_secret=…`.
   * - A hop to a DIFFERENT origin drops the body and every credential-bearing
   *   header. The body is where a token request keeps `client_secret`, and a 307
   *   preserves both method and body — so a hostile (or merely compromised)
   *   token endpoint could otherwise hand our client secret to any host it
   *   named. The SsrfGuard hop check runs first and constrains WHICH hosts are
   *   reachable; this constrains what we hand them once there.
   *
   * Returns `options` itself when nothing needs changing; never mutates it.
   *
   * @param {object} options - the options used for the CURRENT request
   * @param {string} fromUrl - the URL just requested
   * @param {string} toUrl - the resolved Location we are about to follow
   * @param {number} status - the 3xx status that produced the hop
   * @returns {object}
   */
  static _optionsForHop(options, fromUrl, toUrl, status) {
    let next = options;

    if (status === 303 && String(options.method || 'GET').toUpperCase() !== 'GET') {
      next = AbstractSource._withoutBody({ ...next, method: 'GET' });
    }

    if (!AbstractSource._sameOrigin(fromUrl, toUrl)) {
      next = AbstractSource._withoutBody(next);
      const headers = { ...(next.headers || {}) };
      for (const name of Object.keys(headers)) {
        if (AbstractSource.CREDENTIAL_HEADERS.has(name.toLowerCase())) delete headers[name];
      }
      next = { ...next, headers };
    }

    return next;
  }

  /** Same scheme, host and port. An unparseable URL counts as different (fail safe). */
  static _sameOrigin(a, b) {
    try {
      return new URL(a).origin === new URL(b).origin;
    } catch {
      return false;
    }
  }

  /** A copy of `options` with the body and the headers that describe it removed. */
  static _withoutBody(options) {
    const next = { ...options };
    delete next.body;
    const headers = { ...(next.headers || {}) };
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase();
      if (lower === 'content-type' || lower === 'content-length') delete headers[name];
    }
    next.headers = headers;
    return next;
  }

  /**
   * Build a diagnostic message for a thrown fetch error, folding in error.cause
   * (the DNS/connection detail native fetch stashes there). "fetch failed" alone
   * is useless for diagnosis — this turns it into e.g.
   * "fetch failed (ENOTFOUND: getaddrinfo ENOTFOUND api.example.com)".
   */
  _describeFetchError(error) {
    let msg = error && error.message ? error.message : String(error);
    const cause = error && error.cause;
    if (cause) {
      const causeMsg = cause.message || (typeof cause === 'string' ? cause : '');
      const code = cause.code ? `${cause.code}` : '';
      if (causeMsg && causeMsg !== msg && !msg.includes(causeMsg)) {
        msg += ` (${code ? code + ': ' : ''}${causeMsg})`;
      } else if (code && !msg.includes(code)) {
        msg += ` (${code})`;
      }
    }
    return msg;
  }

  /**
   * Strip credentials from a URL for logging/error messages: keep origin + path,
   * drop the entire query string (API keys are commonly passed there, e.g.
   * ?app_id=SECRET) and any userinfo. Falls back to a coarse split if the URL
   * does not parse.
   * @param {string} u
   * @returns {string}
   */
  _redactUrl(u) {
    try {
      const parsed = new URL(u);
      return parsed.origin + parsed.pathname;
    } catch {
      return String(u).split('?')[0];
    }
  }

  _getRetryParam(name, defaultVal) {
    const param = this.context.getParameter(name);
    if (!param || param.value === undefined || param.value === null || param.value === '') {
      return defaultVal;
    }
    const num = Number(param.value);
    return Number.isFinite(num) ? num : defaultVal;
  }

  /**
   * Exponential backoff with jitter.
   */
  calculateBackoff(attemptNumber, initialDelay = 5000) {
    return Math.round(initialDelay * Math.pow(2, attemptNumber) * (0.5 + Math.random()));
  }

  /**
   * Subclasses override to determine retryable errors.
   */
  isValidToRetry(error) {
    return false;
  }

  /**
   * Determines if an error indicates expired/invalid credentials (the user needs to
   * re-authorize) rather than a transient or internal failure. Default implementation
   * checks standard HTTP auth status codes. Source implementations should override this
   * for providers whose auth errors don't surface as 401/403 (e.g. Facebook's
   * OAuthException comes back as HTTP 400 with a payload error code).
   *
   * @param {Error} error - The error to check
   * @return {boolean} True if this is an authentication/authorization failure
   */
  _isAuthError(error) {
    // The codes are inlined rather than read from the HTTP_STATUS global: that global
    // only exists in the built bundle, and this module is also imported directly.
    return error.statusCode === 401 || error.statusCode === 403;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
