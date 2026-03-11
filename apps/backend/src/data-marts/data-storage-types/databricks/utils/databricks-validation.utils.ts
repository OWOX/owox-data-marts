/**
 * Backend validation utilities for Databricks fully qualified names
 * Format: catalog.schema.table
 *
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Naming Rules
 */

<<<<<<< Updated upstream
import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const DATABRICKS_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_',
  allowTwoLevel: false,
};
=======
import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_';
>>>>>>> Stashed changes

/**
 * Validates if a string matches the Databricks fully qualified name pattern
 * Format: catalog.schema.table
 * Only alphanumeric characters and underscores are allowed
 * Backtick quoting is NOT allowed to prevent SQL injection
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Unity Catalog Naming Rules
 */
<<<<<<< Updated upstream
export const isValidDatabricksFullyQualifiedName = createFullyQualifiedNameValidator(
  DATABRICKS_VALIDATION_CONFIG
);
=======
export const isValidDatabricksFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
});
>>>>>>> Stashed changes

/**
 * Validates if a string matches the Databricks table pattern format
 * Format: catalog.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, and wildcards are allowed
 * Backtick quoting is NOT allowed to prevent SQL injection
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Unity Catalog Naming Rules
 */
<<<<<<< Updated upstream
export const isValidDatabricksTablePattern = createTablePatternValidator(
  DATABRICKS_VALIDATION_CONFIG
);
=======
export const isValidDatabricksTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});
>>>>>>> Stashed changes
