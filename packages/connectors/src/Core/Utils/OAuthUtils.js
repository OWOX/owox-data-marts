/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * OAuth utilities for handling authentication flows
 */
var OAuthUtils = {
  /**
   * Universal OAuth access token retrieval method
   *
   * @param {Object} options - All configuration options
   * @param {Object} options.config - Configuration object containing credentials
   * @param {string} options.tokenUrl - OAuth token endpoint URL
   * @param {Object} options.formData - Form data to send in request body
   * @param {Object} [options.headers] - Request headers
   * @returns {string} - The access token
   */
  async getAccessToken({ config, tokenUrl, formData, headers = {} }) {
    const requestHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers
    };

    const options = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: requestHeaders,
      payload: formData,
      body: Object.entries(formData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    };

    try {
      const resp = await EnvironmentAdapter.fetch(tokenUrl, options);
      const text = await resp.getContentText();
      const json = JSON.parse(text);

      if (json.error) {
        throw new Error(`Token error: ${json.error}`);
      }

      config.AccessToken = { value: json.access_token };
      config.logMessage(`Successfully obtained access token`);

      return json.access_token;
    } catch (error) {
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  },

  /**
   * Get access token using Service Account JWT authentication
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.config - Configuration object
   * @param {string} options.tokenUrl - Token URL
   * @param {string} options.serviceAccountKeyJson - Service Account JSON key content
   * @param {string} options.scope - OAuth scope (e.g., "https://www.googleapis.com/auth/adwords")
   * @returns {string} - The access token
   */
  async getServiceAccountToken({ config, tokenUrl, serviceAccountKeyJson, scope }) {
    try {
      const serviceAccountData = JSON.parse(serviceAccountKeyJson);

      const now = Math.floor(Date.now() / 1000);
      const jwt = this.createJWT({
        payload: {
          iss: serviceAccountData.client_email,
          scope: scope,
          aud: tokenUrl,
          exp: now + 3600,
          iat: now
        },
        privateKey: serviceAccountData.private_key
      });

      const formData = {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      };

      const accessToken = await this.getAccessToken({
        config,
        tokenUrl,
        formData
      });

      config.logMessage("✅ Successfully authenticated with Service Account");

      return accessToken;

    } catch (error) {
      config.logMessage(`❌ Service Account authentication failed: ${error.message}`);
      throw new Error(`Service Account authentication failed: ${error.message}`);
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
      alg: "RS256",
      typ: "JWT"
    };
    
    // Base64URL encode header and payload
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
    
    // Convert base64 to base64url
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
};
