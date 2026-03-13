/**
 * Backend validation utilities for Redshift fully qualified names
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_';

/** Format: schema.table or "schema"."table" (quoted segments allowed) */
export const isValidRedshiftFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
  allowQuotedSegments: true,
});

/** Format: schema.table_* or database.schema.table_* (with wildcard) */
export const isValidRedshiftTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: true,
});
