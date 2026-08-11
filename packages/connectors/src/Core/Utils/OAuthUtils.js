/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * OAuth utilities for handling authentication flows.
 *
 * All public functions take a `context` (AbstractContext) so they can read
 * parameters via `context.getParameter()`, log via `context.log()`, and write
 * obtained tokens back into `context.sourceConfig`. Use bare `fetch()` —
 * AbstractSource's `urlFetchWithRetry()` is not available here because these
 * helpers are called outside Source instances too.
 */
var OAuthUtils = {
  /**
   * Universal OAuth access token retrieval method.
   *
   * Writes the obtained access token to `context.sourceConfig.AccessToken`
   * (creating it if absent) so subsequent calls can read it via
   * `context.getParameter('AccessToken')`.
   *
   * @param {Object} options
   * @param {Object} options.context - AbstractContext-shaped object
   * @param {string} options.tokenUrl - OAuth token endpoint URL
   * @param {Object} options.formData - Form data to send in request body
   * @param {Object} [options.headers] - Additional request headers
   * @returns {Promise<string>} - The access token
   */
  async getAccessToken({ context, tokenUrl, formData, headers = {} }) {
    const requestHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    };

    const body = Object.entries(formData)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: requestHeaders,
        body,
      });

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(`Invalid JSON response (HTTP ${response.status})`);
      }

      if (!response.ok || json.error) {
        const tokenError = new Error(
          `Token error: ${json.error || `HTTP ${response.status}`}${json.error_description ? ` - ${json.error_description}` : ''}`
        );
        // invalid_grant = dead/revoked refresh token (RFC 6749): the user must
        // reconnect the account — a warning, not an ops-actionable error
        tokenError.isWarning = json.error === 'invalid_grant';
        throw tokenError;
      }

      // Write the token back into context.sourceConfig so callers can read it
      // via context.getParameter('AccessToken').
      if (context && context.sourceConfig) {
        context.sourceConfig.AccessToken = { value: json.access_token };
      }

      if (context && typeof context.log === 'function') {
        context.log(LOG_LEVEL.INFO, 'Successfully obtained access token');
      }

      return json.access_token;
    } catch (error) {
      const wrapped = new Error(`Failed to get access token: ${error.message}`);
      wrapped.isWarning = error.isWarning;
      throw wrapped;
    }
  },

  /**
   * Get access token using Service Account JWT authentication.
   *
   * @param {Object} options
   * @param {Object} options.context - AbstractContext-shaped object
   * @param {string} options.tokenUrl - Token URL
   * @param {string} options.serviceAccountKeyJson - Service Account JSON key content
   * @param {string} options.scope - OAuth scope (e.g., "https://www.googleapis.com/auth/adwords")
   * @returns {Promise<string>} - The access token
   */
  async getServiceAccountToken({ context, tokenUrl, serviceAccountKeyJson, scope }) {
    try {
      const serviceAccountData = JSON.parse(serviceAccountKeyJson);

      const now = Math.floor(Date.now() / 1000);
      const jwt = this.createJWT({
        payload: {
          iss: serviceAccountData.client_email,
          scope: scope,
          aud: tokenUrl,
          exp: now + 3600,
          iat: now,
        },
        privateKey: serviceAccountData.private_key,
      });

      const formData = {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      };

      const accessToken = await this.getAccessToken({
        context,
        tokenUrl,
        formData,
      });

      if (context && typeof context.log === 'function') {
        context.log(LOG_LEVEL.INFO, '✅ Successfully authenticated with Service Account');
      }

      return accessToken;
    } catch (error) {
      if (context && typeof context.log === 'function') {
        context.log(LOG_LEVEL.ERROR, `❌ Service Account authentication failed: ${error.message}`);
      }
      const wrapped = new Error(`Service Account authentication failed: ${error.message}`);
      // Second wrap of the same failure: without carrying the flag, a dead refresh
      // token would reach the runner as a hard error instead of a warning.
      wrapped.isWarning = error.isWarning;
      throw wrapped;
    }
  },

  /**
   * Create JWT token for Service Account authentication
   *
   * @param {Object} options - JWT creation options
   * @param {Object} options.payload - JWT payload
   * @param {string} options.privateKey - Private key for signing
   * @returns {string} - JWT token
   */
  createJWT({ payload, privateKey }) {
    const crypto = require('crypto');

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const headerB64 = this._base64URLEncode(JSON.stringify(header));
    const payloadB64 = this._base64URLEncode(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    sign.end();
    const signature = sign.sign(privateKey);

    const signatureB64 = this._base64URLEncode(signature);
    return `${headerB64}.${payloadB64}.${signatureB64}`;
  },

  /**
   * Base64URL encoding (RFC 4648 Section 5)
   *
   * @param {string|Buffer} data - Data to encode
   * @returns {string} - Base64URL encoded string
   * @private
   */
  _base64URLEncode(data) {
    let base64;

    if (typeof data === 'string') {
      base64 = Buffer.from(data, 'utf8').toString('base64');
    } else {
      base64 = data.toString('base64');
    }

    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  },
};
