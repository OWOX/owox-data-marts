/**
 * Backend validation utilities for Athena fully qualified names
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_\\-';

/** Format: database.table or catalog.database.table */
export const isValidAthenaFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
});

/** Format: database.table_* or catalog.database.table_* (with wildcard) */
export const isValidAthenaTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: true,
});
