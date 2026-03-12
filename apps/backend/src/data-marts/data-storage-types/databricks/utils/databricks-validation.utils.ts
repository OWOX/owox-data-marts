/**
 * Backend validation utilities for Databricks fully qualified names
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Naming Rules
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_';

const threeLevelValidator = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
});

const twoOrThreeLevelValidator = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
});

/** Format: catalog.schema.table or schema.table (with allowTwoLevel) */
export function isValidDatabricksFullyQualifiedName(
  value: string,
  options?: { allowTwoLevel?: boolean }
): boolean {
  const validator = options?.allowTwoLevel ? twoOrThreeLevelValidator : threeLevelValidator;
  return validator(value);
}

/** Format: catalog.schema.table_* (with wildcard) */
export const isValidDatabricksTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});
