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
  getAccessToken({ config, tokenUrl, formData, headers = {} }) {
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
      const resp = EnvironmentAdapter.fetch(tokenUrl, options);
      const json = JSON.parse(resp.getContentText());
      
      if (json.error) {
        throw new Error(`Token error: ${json.error}`);
      }
      
      config.logMessage(`✅ Successfully obtained access token`);
      
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
   * @param {string} options.serviceAccountKeyJson - Service Account JSON key content
   * @param {string} options.scope - OAuth scope (e.g., "https://www.googleapis.com/auth/adwords")
   * @param {string} [options.tokenUrl] - Token URL (defaults to Google's OAuth2 endpoint)
   * @returns {string} - The access token
   */
  getServiceAccountToken({ config, serviceAccountKeyJson, scope, tokenUrl = "https://oauth2.googleapis.com/token" }) {
    try {
      const serviceAccountData = JSON.parse(serviceAccountKeyJson);
      
      const now = Math.floor(Date.now() / 1000);
      const jwt = this.createJWT({
        payload: {
          iss: serviceAccountData.client_email,
          scope: scope,
          aud: tokenUrl,
          exp: now + 3600, // 1 hour
          iat: now
        },
        privateKey: serviceAccountData.private_key
      });
      
      const formBody = `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`;
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: formBody,
        body: formBody,
        muteHttpExceptions: true
      };
      
      const resp = EnvironmentAdapter.fetch(tokenUrl, options);
      const json = JSON.parse(resp.getContentText());
      
      if (json.error) {
        throw new Error(`Service Account auth error: ${json.error_description || json.error}`);
      }
      
      config.logMessage("✅ Successfully authenticated with Service Account");
      
      return json.access_token;
      
    } catch (error) {
      config.logMessage(`❌ Service Account authentication failed: ${error.message}`);
      throw new Error(`Service Account authentication failed: ${error.message}`);
    }
  },

  /**
   * Create JWT token for Service Account authentication
   * Works in both Node.js (using crypto) and Apps Script (using Utilities)
   * 
   * @param {Object} options - JWT creation options
   * @param {Object} options.payload - JWT payload
   * @param {string} options.privateKey - Private key for signing
   * @returns {string} - JWT token
   */
  createJWT({ payload, privateKey }) {
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    
    // Base64URL encode header and payload
    const headerB64 = this._base64URLEncode(JSON.stringify(header));
    const payloadB64 = this._base64URLEncode(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;
    
    // Sign using Node.js crypto or Apps Script Utilities
    let signature;
    if (typeof require !== 'undefined') {
      // Node.js environment
      const crypto = require('crypto');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signatureInput);
      sign.end();
      signature = sign.sign(privateKey);
    } else if (typeof Utilities !== 'undefined' && Utilities.computeRsaSha256Signature) {
      // Apps Script environment
      signature = Utilities.computeRsaSha256Signature(signatureInput, privateKey);
    } else {
      throw new Error("JWT signing not supported in this environment");
    }
    
    const signatureB64 = this._base64URLEncode(signature);
    return `${headerB64}.${payloadB64}.${signatureB64}`;
  },

  /**
   * Base64URL encoding (RFC 4648 Section 5)
   * Works in both Node.js and Apps Script environments
   * 
   * @param {string|Buffer} data - Data to encode
   * @returns {string} - Base64URL encoded string
   * @private
   */
  _base64URLEncode(data) {
    let base64;
    
    if (typeof data === 'string') {
      if (typeof Buffer !== 'undefined') {
        // Node.js
        base64 = Buffer.from(data, 'utf8').toString('base64');
      } else if (typeof Utilities !== 'undefined') {
        // Apps Script
        base64 = Utilities.base64Encode(data);
      } else {
        throw new Error("Base64 encoding not supported in this environment");
      }
    } else {
      // data is a Buffer or byte array
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        base64 = data.toString('base64');
      } else if (typeof Utilities !== 'undefined') {
        base64 = Utilities.base64Encode(data);
      } else {
        throw new Error("Base64 encoding not supported in this environment");
      }
    }
    
    // Convert base64 to base64url
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
};
