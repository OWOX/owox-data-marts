/**
 * CORS configuration constants
 */
export const CORS_CONFIG = {
  ALLOWED_HEADERS: ['content-Type', 'authorization', 'x-owox-authorization'],
  MAX_AGE: 86_400, // 24 hours in seconds
  METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  OPTIONS_SUCCESS_STATUS: 204,
};
