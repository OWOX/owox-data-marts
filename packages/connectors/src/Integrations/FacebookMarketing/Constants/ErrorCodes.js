/**
 * Facebook API error codes for retry logic
 * Source: Facebook API documentation https://developers.facebook.com/docs/
 */

// Rate limiting error codes
var FB_RATE_LIMIT_ERROR_CODES = [4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008];

// Temporary OAuth error code
var FB_TEMPORARY_OAUTH_ERROR_CODE = 2;

// Batch error code
var FB_BATCH_ERROR_CODE = 960;

// Unknown error code
var FB_UNKNOWN_ERROR_CODE = 99;

// Connection reset error code
var FB_CONNECTION_RESET_ERROR_CODE = 104;

// All retryable error codes combined
var FB_RETRYABLE_ERROR_CODES = [
  ...FB_RATE_LIMIT_ERROR_CODES,
  FB_TEMPORARY_OAUTH_ERROR_CODE,
  FB_BATCH_ERROR_CODE,
  FB_UNKNOWN_ERROR_CODE,
  FB_CONNECTION_RESET_ERROR_CODE
];
