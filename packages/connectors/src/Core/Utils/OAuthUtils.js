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
      
      config.AccessToken = { value: json.access_token };
      config.logMessage(`Successfully obtained access token`);
      
      return json.access_token;
    } catch (error) {
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }
};
