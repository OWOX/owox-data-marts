/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var EXECUTION_STATUS = {
  IMPORT_IN_PROGRESS: 1,
  CLEANUP_IN_PROGRESS: 2,
  IMPORT_DONE: 3,
  CLEANUP_DONE: 4,
  ERROR: 5,
};

var RUN_CONFIG_TYPE = {
  INCREMENTAL: 'INCREMENTAL',
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
};

// Upper bound on the inclusive date range a single MANUAL_BACKFILL run may cover.
// 31 so that any full calendar month fits in one run. The backend rejects a longer
// range before a run is created; this is re-checked here as a last line of defense.
var MAX_MANUAL_BACKFILL_DAYS = 31;

var CONFIG_ATTRIBUTES = {
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
  HIDE_IN_CONFIG_FORM: 'HIDE_IN_CONFIG_FORM',
  SECRET: 'SECRET',
  ADVANCED: 'ADVANCED',
  OAUTH_FLOW: 'OAUTH_FLOW',
  DEPRECATED: 'DEPRECATED',
  PINNED: 'PINNED',
  // The field's allowed values come from the source at configuration time, not
  // from a static `options` list: the source implements
  // `fetchFieldOptions(fieldName, signal)` and may list the fields it needs first
  // in the parameter's `optionsDependsOn`.
  DYNAMIC_OPTIONS: 'DYNAMIC_OPTIONS',
};

var OAUTH_CONSTANTS = {
  UI: 'UI',
  SECRET: 'SECRET',
  REQUIRED: 'REQUIRED',
};

var OAUTH_SOURCE_CREDENTIALS_KEY = '_source_credential_id';
