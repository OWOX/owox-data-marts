/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Abstract base class for all application exceptions.
 * Prevents direct instantiation — only inheritance allowed.
 */
class AbstractException extends Error {
  /**
   * @param {string} message - Description of the exception.
   */
  constructor(message) {
    if (new.target === AbstractException) {
      throw new Error("AbstractException cannot be instantiated directly");
    }
    super(message);
    this.name = new.target.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }
}

/**
 * Exception thrown when an HTTP request fails or returns an unexpected status.
 */
class HttpRequestException extends AbstractException {
  /**
   * @param {Object} params
   * @param {string} params.message     - Error message.
   * @param {number=} params.statusCode - Optional HTTP status code.
   * @param {Object=} params.payload    - Optional parsed JSON response.
   */
  constructor({ message, statusCode, payload }) {
    super(message);
    if (statusCode != null) this.statusCode = statusCode;
    if (payload != null) this.payload = payload;
  }
}

/**
 * Exception thrown when an OAuth flow fails.
 */
class OauthFlowException extends AbstractException {
  /**
   * @param {Object} params
   * @param {string} params.message     - Error message.
   * @param {number=} params.statusCode - Optional HTTP status code.
   * @param {Object=} params.payload    - Optional error payload.
   */
  constructor({ message, statusCode, payload }) {
    super(message);
    if (statusCode != null) this.statusCode = statusCode;
    if (payload != null) this.payload = payload;
  }
}
