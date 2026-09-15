/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getPath } from './pathUtils.js';
import {
  GENERATED_REFRESH_TOKEN_CONFIG_FIELD,
  GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD,
} from '../../Constants/CredentialConstants.js';

/**
 * Applies authentication to an outgoing request spec.
 * - apply(): synchronous injection of a templated value into header/query.
 *   Types: apiKey, bearer, tokenExchange (all inject via inject.format).
 * - prepare(): async, runs BEFORE apply. No-op for apiKey/bearer. For
 *   tokenExchange it issues a token (POST exchange.body -> exchange.url),
 *   reads exchange.tokenPath, caches it for ttlSeconds, and writes it into
 *   scope.auth.token so inject.format ("Bearer {{ auth.token }}") resolves.
 *   Tokens are cached in options.tokenCache — a Map the HOST owns, so the cache
 *   survives the per-fetchData lifetime of this object — under a key derived
 *   from the rendered token request (_tokenCacheKey), which is what keeps two
 *   accounts from ever sharing one token.
 * - oauth2: form-encoded refresh_token/client_credentials grant against tokenUrl;
 *   caches by expires_in (60s skew), falling back to config.ttlSeconds or a
 *   conservative default when the provider omits expires_in (RFC 6749 §5.1
 *   marks it OPTIONAL); prefers a host-persisted rotated refresh token with
 *   fallback to the original on invalid_grant; and reports a newly rotated
 *   token via options.onCredentialsUpdate. apply() is shared/unchanged.
 */

const TOKEN_EXPIRY_SKEW_SECONDS = 60;
// Cache TTL used when the token response has no usable expires_in and the
// manifest author did not set config.ttlSeconds. Conservative on purpose: an
// oversized default would repeat the "never re-request" bug for providers
// with genuinely short-lived tokens.
const OAUTH2_DEFAULT_TTL_SECONDS = 300;

function encodeForm(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function isInvalidGrant(error) {
  if (!error) return false;
  if (error.payload && error.payload.error === 'invalid_grant') return true;
  return typeof error.message === 'string' && error.message.includes('invalid_grant');
}

export class Authenticator {
  constructor(config, templateEngine, ssrfGuard = null, options = {}) {
    this.config = config || null;
    this.templateEngine = templateEngine;
    this.ssrfGuard = ssrfGuard;
    // Optional: called with the rotated credential when the provider issues a new
    // refresh token. Omitted (tests, bundled callers) = rotation is not emitted.
    this.onCredentialsUpdate = options.onCredentialsUpdate || null;
    this._token = null;
    // Access-token cache. The host passes one in (DeclarativeSource creates a
    // single Map per run) so it OUTLIVES this instance: an Authenticator is
    // built per fetchData — i.e. per node, per account, per date slice — so a
    // purely private cache is thrown away before it can ever be reused, and a
    // 365-day x 10-account x 2-node incremental backfill POSTs the token
    // endpoint ~7300 times where roughly one call per hour would do. Falls back
    // to a private Map so a standalone Authenticator (bundled callers, unit
    // tests) keeps exactly its previous single-instance behaviour.
    //
    // Sharing is only safe because entries are keyed by the fully RENDERED token
    // request — see _tokenCacheKey. Sub-authenticators of a `selective` config
    // are handed the same Map on purpose: their URLs and bodies differ, so their
    // keys do too.
    this._tokenCache = options.tokenCache instanceof Map ? options.tokenCache : new Map();
    // A refresh token rotated by THIS Authenticator instance; wins over the
    // host-persisted one. Its reuse is bounded to a single node's fetch, NOT the
    // whole run: DeclarativeSource constructs a fresh Authenticator per fetchData
    // call, so this field is discarded at every node boundary. Cross-node reuse
    // within a run relies on the host-persisted scope.parameters.GeneratedRefreshToken
    // (see _refreshTokenCandidates), which the DeclarativeSource callback keeps
    // current via its onCredentialsUpdate option.
    this._rotatedRefreshToken = null;
    this._sub = null;
    if (this.config && this.config.type === 'selective') {
      this._sub = {};
      for (const [key, subConfig] of Object.entries(this.config.authenticators || {})) {
        this._sub[key] = new Authenticator(subConfig, templateEngine, ssrfGuard, options);
      }
    }
  }

  _resolveSub(scope) {
    const key = scope?.parameters?.[this.config.selectionParameter];
    const sub = key != null ? this._sub[key] : undefined;
    if (!sub) {
      throw new Error(`Authenticator: selective auth has no authenticator for "${key}"`);
    }
    return sub;
  }

  /**
   * Async pre-step. Issues/caches tokens for token-based strategies and writes
   * the resolved token into scope.auth.token.
   * @param {object} scope
   * @param {{urlFetchWithRetry: Function}} httpClient
   * @param {() => number} now - epoch ms provider
   */
  async prepare(scope, httpClient, now = () => Date.now()) {
    if (this.config?.type === 'selective') {
      return this._resolveSub(scope).prepare(scope, httpClient, now);
    }
    if (!this.config) return;
    if (this.config.type === 'tokenExchange')
      return this._prepareTokenExchange(scope, httpClient, now);
    if (this.config.type === 'oauth2') return this._prepareOAuth2(scope, httpClient, now);
  }

  /**
   * Cache identity of a token request: the auth strategy, the endpoint, and every
   * RENDERED value that goes into the request body. Two prepare() calls share a
   * cached access token only when they would have issued a byte-identical POST.
   *
   * That is the entire reason this cache may be shared across fetchData calls.
   * Token requests routinely template `account.id`, `dateWindow` or a parameter,
   * so any coarser key — the token URL, the auth type, the config object — would
   * hand ONE ACCOUNT'S ACCESS TOKEN to another account's requests, which is a
   * far worse bug than the redundant POSTs it set out to remove. Rendering first
   * and keying on the result makes that impossible by construction: a request
   * that varies per account keys per account, and a request that does not vary
   * is, by definition, the same credential being asked for twice.
   *
   * Rendering therefore has to happen BEFORE the cache lookup, not just on a
   * miss. It is string interpolation over a small object — far cheaper than the
   * HTTP round trip it saves.
   *
   * JSON.stringify is property-order sensitive, which is fine here: every body
   * for a given key is built from the same config object literal, so its
   * property order is fixed.
   */
  _tokenCacheKey(type, url, body) {
    return JSON.stringify([type, url, body]);
  }

  /** @returns {string|undefined} the cached token for `key`, if still in its TTL */
  _readCachedToken(key, now) {
    const hit = this._tokenCache.get(key);
    return hit && now() < hit.expiresAt ? hit.token : undefined;
  }

  _storeToken(key, token, expiresAt) {
    this._token = token;
    this._tokenCache.set(key, { token, expiresAt });
  }

  /**
   * Shared token-endpoint call: threads a per-hop validator so a redirect on the
   * token exchange cannot pivot the request elsewhere, issues the request, and
   * parses the JSON body. Callers own the pre-check, body encoding, expiry and
   * caching.
   *
   * The validator is the manifest ALLOWLIST (`assertAllowed`), not the weaker
   * public-https check used for dynamic download URLs. This request carries the
   * client secret in its body and a 307 replays method AND body verbatim to
   * whatever `Location` names, so "any public host" is not an acceptable hop
   * target — only a host the manifest itself declared. The token endpoint's own
   * host is always on that list: ManifestParser._collectHosts adds
   * `authentication.tokenUrl` and `authentication.exchange.url` (including every
   * `selective` branch), so a same-host redirect still works.
   */
  async _postToken(url, options, httpClient) {
    const validate = this.ssrfGuard ? nextUrl => this.ssrfGuard.assertAllowed(nextUrl) : undefined;
    const response = await httpClient.urlFetchWithRetry(url, options, validate);
    return response.json();
  }

  async _prepareTokenExchange(scope, httpClient, now) {
    const ex = this.config.exchange;
    if (!ex || !ex.url || !ex.tokenPath) {
      throw new Error('Authenticator: tokenExchange requires exchange.url and exchange.tokenPath');
    }

    if (this.ssrfGuard) {
      await this.ssrfGuard.assertPublicHttps(ex.url);
    }

    const body = this.templateEngine ? this._renderDeep(ex.body, scope) : ex.body;
    const key = this._tokenCacheKey('tokenExchange', ex.url, body);

    const cached = this._readCachedToken(key, now);
    if (cached !== undefined) {
      this._token = cached;
      this._writeToken(scope);
      return;
    }

    const json = await this._postToken(
      ex.url,
      {
        method: (ex.method || 'POST').toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      httpClient
    );
    const token = getPath(json, ex.tokenPath);
    if (token === undefined || token === null) {
      throw new Error(`Authenticator: token not found at exchange.tokenPath`);
    }
    this._storeToken(key, token, now() + (Number(ex.ttlSeconds) || 0) * 1000);
    this._writeToken(scope);
  }

  async _prepareOAuth2(scope, httpClient, now) {
    const c = this.config;
    if (!c.tokenUrl) throw new Error('Authenticator: oauth2 requires tokenUrl');
    const grantType = c.grantType || 'refresh_token';

    if (this.ssrfGuard) {
      await this.ssrfGuard.assertPublicHttps(c.tokenUrl);
    }

    const render = v => (v == null ? undefined : this.templateEngine.render(String(v), scope));
    const base = {
      grant_type: grantType,
      client_id: render(c.clientId),
      client_secret: render(c.clientSecret),
      scope: render(c.scope),
    };

    const candidates =
      grantType === 'refresh_token'
        ? this._refreshTokenCandidates(scope, render(c.refreshToken))
        : [null];
    const keyFor = refreshToken =>
      this._tokenCacheKey(
        'oauth2',
        c.tokenUrl,
        refreshToken ? { ...base, refresh_token: refreshToken } : base
      );

    // Every candidate is a refresh token for the SAME credential set (the
    // current one and the originally configured fallback), so a hit on either is
    // this caller's own token — never another account's, whose rendered `base`
    // or refresh token would differ and so key differently.
    for (const refreshToken of candidates) {
      const cached = this._readCachedToken(keyFor(refreshToken), now);
      if (cached !== undefined) {
        this._token = cached;
        this._writeToken(scope);
        return;
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const refreshToken = candidates[i];
      try {
        const json = await this._postToken(
          c.tokenUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: encodeForm(refreshToken ? { ...base, refresh_token: refreshToken } : base),
          },
          httpClient
        );

        if (json && json.error) {
          throw new Error(`Token error: ${json.error} - ${json.error_description}`);
        }
        if (!json || !json.access_token) {
          throw new Error('Authenticator: oauth2 response has no access_token');
        }

        const expiresIn = Number(json.expires_in);
        const ttlSeconds =
          Number.isFinite(expiresIn) && expiresIn > 0
            ? Math.max(0, expiresIn - TOKEN_EXPIRY_SKEW_SECONDS)
            : Number.isFinite(Number(this.config.ttlSeconds)) && Number(this.config.ttlSeconds) > 0
              ? Number(this.config.ttlSeconds)
              : OAUTH2_DEFAULT_TTL_SECONDS;
        const expiresAt = now() + ttlSeconds * 1000;
        this._storeToken(keyFor(refreshToken), json.access_token, expiresAt);

        // The provider rotated the refresh token: reuse it for the rest of this
        // run and report it so the host persists it for the next one.
        if (json.refresh_token && json.refresh_token !== refreshToken) {
          this._rotatedRefreshToken = json.refresh_token;
          // Also file the still-valid access token under the key the NEXT
          // prepare will compute. That one reads the rotated token back out of
          // scope.parameters.GeneratedRefreshToken, so it would key on
          // `refresh_token: <rotated>` and miss — meaning a provider that
          // rotates on every refresh would defeat the cache entirely and keep
          // re-POSTing. Same credential set, same token: only the name it is
          // filed under changes.
          this._storeToken(keyFor(json.refresh_token), json.access_token, expiresAt);
          if (this.onCredentialsUpdate) {
            this.onCredentialsUpdate({
              [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: json.refresh_token,
            });
          }
        }

        this._writeToken(scope);
        return;
      } catch (error) {
        // Only a rejected refresh token is worth retrying with the next candidate.
        if (i < candidates.length - 1 && isInvalidGrant(error)) continue;
        throw error;
      }
    }
  }

  /**
   * Refresh tokens to try, most-current first: one rotated earlier in this node's
   * fetch, else the host-persisted GeneratedRefreshToken, with the originally
   * configured token kept as a fallback when it differs.
   */
  _refreshTokenCandidates(scope, originalRefreshToken) {
    const generated =
      this._rotatedRefreshToken || scope?.parameters?.[GENERATED_REFRESH_TOKEN_CONFIG_FIELD];
    if (generated && originalRefreshToken && generated !== originalRefreshToken) {
      return [generated, originalRefreshToken];
    }
    return [generated || originalRefreshToken];
  }

  _writeToken(scope) {
    scope.auth = scope.auth || {};
    scope.auth.token = this._token;
  }

  _renderDeep(value, scope) {
    if (typeof value === 'string') return this.templateEngine.render(value, scope);
    if (Array.isArray(value)) return value.map(v => this._renderDeep(v, scope));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = this._renderDeep(v, scope);
      return out;
    }
    return value;
  }

  apply(req, scope) {
    if (!this.config) return;

    if (this.config.type === 'selective') {
      return this._resolveSub(scope).apply(req, scope);
    }

    const { type, inject } = this.config;
    if (
      type !== 'apiKey' &&
      type !== 'bearer' &&
      type !== 'tokenExchange' &&
      type !== 'basic' &&
      type !== 'oauth2'
    ) {
      throw new Error(`Authenticator: unsupported type "${type}"`);
    }

    if (type === 'basic') {
      const username = this.templateEngine.render(this.config.username ?? '', scope);
      if (!username) {
        throw new Error('Authenticator: "basic" requires username');
      }
      const password = this.templateEngine.render(this.config.password ?? '', scope);
      const encoded = Buffer.from(`${username}:${password}`, 'utf-8').toString('base64');
      req.headers['Authorization'] = `Basic ${encoded}`;
      return;
    }

    if (!inject || !inject.name || !inject.format) {
      throw new Error(`Authenticator: "${type}" requires inject.name and inject.format`);
    }

    const value = this.templateEngine.render(inject.format, scope);

    if (inject.into === 'header') {
      req.headers[inject.name] = value;
    } else if (inject.into === 'query') {
      req.query[inject.name] = value;
    } else {
      throw new Error(
        `Authenticator: inject.into must be "header" or "query", got "${inject.into}"`
      );
    }
  }
}
