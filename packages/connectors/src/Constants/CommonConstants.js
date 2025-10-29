/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ENVIRONMENT = {
  UNKNOWN: 1,
  APPS_SCRIPT: 2,
  NODE: 3,
};

var EXECUTION_STATUS = {
  IMPORT_IN_PROGRESS: 1,
  CLEANUP_IN_PROGRESS: 2,
  IMPORT_DONE: 3,
  CLEANUP_DONE: 4,
  ERROR: 5
};

var RUN_CONFIG_TYPE = {
  INCREMENTAL: 'INCREMENTAL',
  MANUAL_BACKFILL: 'MANUAL_BACKFILL'
};

var CONFIG_ATTRIBUTES = {
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
  HIDE_IN_CONFIG_FORM: 'HIDE_IN_CONFIG_FORM',
  SECRET: 'SECRET',
  ADVANCED: 'ADVANCED'
};
