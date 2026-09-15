/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 *
 * The Vite bundler (see vite.config.js processEntityFile) strips `export`
 * keywords when concatenating these files into the single-scope bundle, so
 * `export const X = ...` becomes `const X = ...` in the bundle. Outside the
 * bundle, the same source can be imported as ESM (e.g., from tests or from
 * other src files that the bundler also strips).
 */

export const EXECUTION_STATUS = Object.freeze({
  IMPORT_IN_PROGRESS: 1,
  CLEANUP_IN_PROGRESS: 2,
  IMPORT_DONE: 3,
  CLEANUP_DONE: 4,
  ERROR: 5,
});

export const RUN_CONFIG_TYPE = Object.freeze({
  INCREMENTAL: 'INCREMENTAL',
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
});

export const CONFIG_ATTRIBUTES = Object.freeze({
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
  HIDE_IN_CONFIG_FORM: 'HIDE_IN_CONFIG_FORM',
  SECRET: 'SECRET',
  ADVANCED: 'ADVANCED',
  OAUTH_FLOW: 'OAUTH_FLOW',
  DEPRECATED: 'DEPRECATED',
  PINNED: 'PINNED',
});

export const OAUTH_CONSTANTS = Object.freeze({
  UI: 'UI',
  SECRET: 'SECRET',
  REQUIRED: 'REQUIRED',
});

export const OAUTH_SOURCE_CREDENTIALS_KEY = '_source_credential_id';

// LogEvent levels
export const LOG_LEVEL = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

// ControlEvent actions
export const CONTROL_ACTION = Object.freeze({
  STARTED: 'started',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
});

// BaseEvent type discriminator
export const EVENT_TYPE = Object.freeze({
  LOG: 'LOG',
  DATA: 'DATA',
  TRACE: 'TRACE',
  ANALYTICS: 'ANALYTICS',
  STATE: 'STATE',
  CONTROL: 'CONTROL',
  CREDENTIALS: 'CREDENTIALS',
  SAMPLE: 'SAMPLE',
  FIELDS: 'FIELDS',
});

// AbstractSource.getDateStrategy() return values
export const DATE_STRATEGY = Object.freeze({
  DAY_BY_DAY: 'day-by-day',
  RANGE: 'range',
  NONE: 'none',
});

// AbstractContext.registerParameters owner argument
export const PARAMETER_OWNER = Object.freeze({
  SOURCE: 'source',
  STORAGE: 'storage',
});

// Marker prefix written by TestStorage to stdout so the spawning process can
// collect sample rows during live-test runs.
export const TEST_ROW_MARKER = '__OW_ROW__';
