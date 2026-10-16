/** Plugin backend action limits. None is configurable through the environment. */
export const PLUGIN_ACTION_LIMITS = {
  maxActions: 50,
  maxInputSchemaBytes: 32 * 1024,
  maxInputSchemaNodes: 2000,
  maxInputBytes: 256 * 1024,
  maxJsonDepth: 100,
  routeBodyLimit: '512kb',
  maxResultBytes: 1024 * 1024,
  maxErrorMessageChars: 1000,
  maxReportedInputErrors: 20,
  maxRunningPerInstallation: 5,
  maxStartsPerInstallationPerMinute: 60,
  maxStartsPerInstallationPerDay: 5000,
  maxPayloadBytesPerInstallation: 100 * 1024 * 1024,
  maxWaitSeconds: 20,
  waitPollMs: 1000,
  cancelPollMs: 5000,
  orphanGraceMs: 60_000,
  payloadRetentionHours: 24,
  rowRetentionDays: 90,
  sweepBatchSize: 500,
  validationWorkers: 2,
  validationBudgetMs: 500,
  inputSchemaCompileBudgetMs: 2000,
  validationBootMs: 5000,
  validationWorkerHeapMb: 64,
  validationWorkerCacheSize: 50,
  maxValidationsPerVersion: 4,
  maxQueuedValidations: 64,
} as const;

// The SDK keeps copies of these three; `test/contracts/plugin-action-contract.mjs` pins them.
export const PLUGIN_ACTION_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Codes OWOX writes itself; a backend that could send them would read as OWOX's own verdict. */
export const PLUGIN_ACTION_RESERVED_ERROR_CODES: ReadonlySet<string> = new Set([
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_NOT_DECLARED',
  'INVALID_INPUT',
  'INSTALLATION_INACTIVE',
  'PLUGIN_SUSPENDED',
]);

/** OWOX's codes for a call to the backend that failed, such as BACKEND_UNREACHABLE. */
export const PLUGIN_ACTION_RESERVED_ERROR_CODE_PREFIX = 'BACKEND_';

export function isPluginOwnedErrorCode(code: unknown): code is string {
  return (
    typeof code === 'string' &&
    PLUGIN_ACTION_ERROR_CODE_PATTERN.test(code) &&
    !code.startsWith(PLUGIN_ACTION_RESERVED_ERROR_CODE_PREFIX) &&
    !PLUGIN_ACTION_RESERVED_ERROR_CODES.has(code)
  );
}
