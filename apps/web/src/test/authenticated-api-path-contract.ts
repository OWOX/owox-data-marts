/**
 * Shared conformance oracle for the two credential-bearing path boundaries.
 *
 * The public API client and the iframe host deliberately keep separate adapters and
 * error types, but they must make the same admission decision before acquiring a token.
 */
export const acceptedAuthenticatedApiPaths = [
  ['an ordinary API path', '/api/data-marts'],
  ['an API path with a query', '/api/data-marts?limit=10'],
  ['an API path with an encoded Unicode segment', '/api/%E2%9C%93'],
  ['a path at the 2,048-character limit', `/api/${'a'.repeat(2043)}`],
] as const;

export const rejectedAuthenticatedApiPaths = [
  ['a protocol-relative host', '//evil.example/x'],
  ['an absolute foreign URL', 'https://evil.example/x'],
  ['an absolute API URL', 'https://app.owox.test/api/data-marts'],
  ['a path outside /api/', '/auth/context'],
  ['the /api path without its required trailing slash', '/api'],
  ['a traversal out of /api/', '/api/../auth/context'],
  ['nested traversal out of /api/', '/api/data-marts/../auth/context'],
  ['encoded traversal', '/api/%2e%2e/auth/context'],
  ['fragmented double-encoded traversal', '/api/%25%32%65%25%32%65/auth/context'],
  ['nested encoded traversal', '/api/%252e%252e/auth/context'],
  ['a malformed percent escape', '/api/%zz/auth/context'],
  ['malformed encoded Unicode', '/api/%E0%A4%A'],
  ['an encoded slash', '/api/data%2fmarts'],
  ['an encoded backslash', '/api/data%5cmarts'],
  ['a raw backslash', '/api\\data-marts'],
  ['a path over the 2,048-character limit', `/api/${'a'.repeat(2044)}`],
] as const;
