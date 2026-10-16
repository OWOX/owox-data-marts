// Data only, `export const` literals: the backend runs this file as a script.
export const pluginActionErrorCodePatternSource = '^[A-Z][A-Z0-9_]{0,63}$';

/** Codes OWOX sets on an execution itself; a Worker may not return one. */
export const pluginActionReservedErrorCodes = [
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_NOT_DECLARED',
  'INVALID_INPUT',
  'INSTALLATION_INACTIVE',
  'PLUGIN_SUSPENDED',
];

/** OWOX's codes for a call to the Worker that failed, such as BACKEND_UNREACHABLE. */
export const pluginActionReservedErrorCodePrefix = 'BACKEND_';

/** Statuses an execution never leaves. */
export const pluginActionFinalStatuses = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
