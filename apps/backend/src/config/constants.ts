export const DEFAULT_PORT = 3000;

// HTTP server timeout configuration (in milliseconds)
export const DEFAULT_SERVER_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes - overall request timeout
export const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes - keep-alive connection timeout
export const DEFAULT_HEADERS_TIMEOUT_MS = 3 * 60 * 1000 + 5 * 1000; // 3 minutes 5 seconds - headers timeout (slightly higher than keep-alive)
