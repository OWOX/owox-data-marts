// OWOX keeps copies of these; `test/contracts/plugin-action-contract.mjs` pins them.
/** A code a Worker may fail with; `createBackend` sends any other as ACTION_FAILED. */
export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
/** Codes OWOX sets on an execution itself; a Worker reusing one would be indistinguishable. */
export const OWOX_ERROR_CODES: ReadonlySet<string> = new Set([
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_NOT_DECLARED',
  'INVALID_INPUT',
  'INSTALLATION_INACTIVE',
  'PLUGIN_SUSPENDED',
  'OWNER_NOT_MEMBER',
]);
/** OWOX's codes for a call to the Worker that failed, such as BACKEND_UNREACHABLE. */
export const RESERVED_ERROR_CODE_PREFIX = 'BACKEND_';
