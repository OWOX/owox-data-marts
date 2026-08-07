/**
 * Package-neutral conformance oracle for credential-bearing API path boundaries.
 *
 * The API client and plugin host intentionally keep separate validators and error
 * types. Both focused suites consume these cases so their admission decisions cannot
 * drift without a test failure.
 */
export const acceptedAuthenticatedApiPaths = [
  ['an ordinary API path', '/api/data-marts'],
  ['an API path with a query', '/api/data-marts?limit=10'],
  ['an API path with an encoded Unicode segment', '/api/%E2%9C%93'],
  ['a path at the 2,048-character limit', `/api/${'a'.repeat(2043)}`],
];

export const rejectedAuthenticatedApiPaths = [
  ['a protocol-relative host', '//evil.example/x'],
  ['an absolute foreign URL', 'https://evil.example/x'],
  ['a same-origin absolute API URL', 'https://app.owox.test/api/data-marts'],
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
];
