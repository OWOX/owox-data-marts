/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var HTTP_STATUS = {
  // Successful responses (200-299)
  OK: 200,
  SUCCESS_MIN: 200,
  SUCCESS_MAX: 299,
  
  // Client errors (400-499)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,
  
  // Server errors (500-599)
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599
};
