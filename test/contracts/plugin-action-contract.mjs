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
  'OWNER_NOT_MEMBER',
];

/** OWOX's codes for a call to the Worker that failed, such as BACKEND_UNREACHABLE. */
export const pluginActionReservedErrorCodePrefix = 'BACKEND_';

/** Statuses an execution never leaves. */
export const pluginActionFinalStatuses = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];

/** Codes the schedule routes answer with: a refusal of the schedule, or of the token that calls them. */
export const pluginScheduleErrorCodes = [
  'INVALID_SCHEDULE',
  'INVALID_PARAMETERS',
  'PARAMETERS_TOO_LARGE',
  'TOO_MANY_SCHEDULES',
  'SCHEDULE_BUSY',
  'SCHEDULE_NOT_FOUND',
  'SCHEDULE_PAUSED_BY_ADMIN',
  'TOO_MANY_EXECUTIONS',
  'ACTION_NOT_DECLARED',
  'EXECUTION_TOKEN_NOT_ALLOWED',
];
