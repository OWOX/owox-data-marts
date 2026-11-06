import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  DataMartValidationCode,
  type ValidationResult,
} from '../data-storage-types/interfaces/data-mart-validator.interface';
import type { FormulaViolation } from '../calculated-fields/formula-violations';
import { DATA_MART_ERROR_MESSAGES } from '../errors/data-mart-error-messages';
import { MIN_MANUAL_BACKFILL_START_DATE } from '../utils/manual-backfill-range';

const SAFE_MESSAGES = new Set<string>([
  DATA_MART_ERROR_MESSAGES.ALREADY_PUBLISHED,
  DATA_MART_ERROR_MESSAGES.DEFINITION_NOT_FOUND,
  DATA_MART_ERROR_MESSAGES.LEGACY_STORAGE_REQUIRES_SQL,
  DATA_MART_ERROR_MESSAGES.CONNECTOR_TYPE_CHANGE_NOT_ALLOWED,
  DATA_MART_ERROR_MESSAGES.CREDENTIAL_REQUIRED,
  DATA_MART_ERROR_MESSAGES.MCP_CONNECTOR_CONFIGURATION_INVALID,
  DATA_MART_ERROR_MESSAGES.MCP_CONNECTOR_CREDENTIAL_REFERENCE_INVALID,
  DATA_MART_ERROR_MESSAGES.CREDENTIAL_AUTH_TYPE_CHANGE_NOT_ALLOWED,
  DATA_MART_ERROR_MESSAGES.MANUAL_RUN_REQUIRES_CONNECTOR,
  DATA_MART_ERROR_MESSAGES.MANUAL_RUN_REQUIRES_PUBLISHED,
  DATA_MART_ERROR_MESSAGES.CREATE_TRIGGER_REQUIRES_PUBLISHED,
  DATA_MART_ERROR_MESSAGES.UPDATE_TRIGGER_REQUIRES_PUBLISHED,
  DATA_MART_ERROR_MESSAGES.INVALID_SCHEDULE,
  DATA_MART_ERROR_MESSAGES.RELATIONSHIP_SELF_REFERENCE,
  DATA_MART_ERROR_MESSAGES.RELATIONSHIP_STORAGE_MISMATCH,
  DATA_MART_ERROR_MESSAGES.PREVIEW_SCHEMA_REQUIRED,
  DATA_MART_ERROR_MESSAGES.PREVIEW_LIMIT_INVALID,
  DATA_MART_ERROR_MESSAGES.BIGQUERY_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.BIGQUERY_CONNECTOR_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.ATHENA_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.DATABRICKS_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.DATABRICKS_CONNECTOR_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.SNOWFLAKE_IDENTIFIER_INVALID,
  DATA_MART_ERROR_MESSAGES.REDSHIFT_IDENTIFIER_INVALID,
  // Fixed messages from the existing backfill parser; never include the supplied values.
  'StartDate is required in YYYY-MM-DD format',
  'EndDate must be in YYYY-MM-DD format',
  'StartDate cannot be in the future',
  `StartDate cannot be earlier than ${MIN_MANUAL_BACKFILL_START_DATE}`,
  'EndDate cannot be earlier than StartDate',
]);

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  SOURCE_CREDENTIAL_UNAVAILABLE:
    'The saved Credential is unavailable. Check it on the Credentials page in OWOX or select another saved Credential.',
  [DataMartValidationCode.DEFINITION_NOT_FOUND]:
    'Set the Data Mart definition before validating or publishing it.',
  [DataMartValidationCode.STORAGE_CONFIG_NOT_FOUND]:
    'Configure the Data Mart Storage before validating the definition.',
  [DataMartValidationCode.STORAGE_CREDENTIALS_NOT_FOUND]:
    'Select a saved Credential for the Data Mart Storage before validating the definition.',
  [DataMartValidationCode.DATA_MART_REFERENCE_INVALID]:
    'A referenced Data Mart cannot be used. Check that it exists, is published, and uses the same Storage. Check that it does not create a reference cycle.',
  DATA_MART_SINGLE_SOURCE_CONFIGURATION_REQUIRED:
    'This connector requires exactly one source configuration.',
  DATA_MART_RELATIONSHIP_ALIAS_TAKEN:
    'This alias is already used by another relationship. Choose a different target_alias.',
  DATA_MART_RELATIONSHIP_JOIN_FIELD_TYPE_INVALID:
    'A join field has a complex type. Select fields with primitive types for the join conditions.',
  DATA_MART_RELATIONSHIP_JOIN_TYPES_INCOMPATIBLE:
    'The source and target join fields have incompatible types. Select fields with compatible types.',
};
const errorCodeSchema = z.object({ code: z.string() });
const missingFormulaReferencesSchema = z.object({
  errors: z.array(z.object({ code: z.literal('FORMULA_AGGREGATE_WITHOUT_FIELD') })).min(1),
});

/** Only fixed application text is returned; exception responses can also contain credentials. */
export function safeMcpDataMartErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof BadRequestException || error instanceof BusinessViolationException)) {
    return undefined;
  }
  if (
    error instanceof BusinessViolationException &&
    error.message === 'Calculated field validation failed' &&
    missingFormulaReferencesSchema.safeParse(error.errorDetails).success
  ) {
    return 'An aggregate must reference a Data Mart field with {{ref field="field_name"}}. Example: SUM({{ref field="amount"}}).';
  }
  const response =
    error instanceof BadRequestException
      ? errorCodeSchema.safeParse(error.getResponse())
      : undefined;
  const code =
    error instanceof BusinessViolationException
      ? error.code
      : response?.success
        ? response.data.code
        : undefined;
  return (
    (code && Object.hasOwn(CODE_MESSAGES, code) ? CODE_MESSAGES[code] : undefined) ??
    (error.message === DATA_MART_ERROR_MESSAGES.CONFIGURATION_OUT_OF_DATE
      ? "Read get_data_mart_setup again. Preserve each existing configuration's _id and _credential_id. Do not send secret values."
      : SAFE_MESSAGES.has(error.message)
        ? error.message
        : undefined)
  );
}

export function safeMcpDataMartValidationMessage(result: ValidationResult): string {
  if (result.valid) return 'The saved Data Mart definition is valid.';
  return (
    (result.code && Object.hasOwn(CODE_MESSAGES, result.code)
      ? CODE_MESSAGES[result.code]
      : undefined) ??
    (result.code === DataMartValidationCode.INVALID_IDENTIFIER_FORMAT &&
    result.errorMessage &&
    SAFE_MESSAGES.has(result.errorMessage)
      ? result.errorMessage
      : undefined) ??
    'The saved definition could not be validated. Open the Data Mart in OWOX to inspect the detailed validation result.'
  );
}

const WARNING_MESSAGES: Readonly<Record<string, string>> = {
  FORMULA_UNGUARDED_DIVISION:
    'A formula can divide by zero. Wrap its denominator in NULLIF(denominator, 0).',
  FORMULA_JOINED_MEASURE_MULTIPLIED:
    'A joined COUNT can count the same source row more than once. Check the join keys. Consider a unique count.',
  FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN:
    'A joined COUNT could not be verified because a source has no Primary Key. Set its Primary Key. Check the join keys.',
  FORMULA_JOINED_MEASURE_COLLAPSED:
    'A joined measure can collapse rows with the same join key. Check whether the join keys identify each source row.',
  FORMULA_JOINED_ROWS_EXCLUDED:
    'Rows in a joined Data Mart with no match are excluded. The result can differ from the total for that Data Mart.',
  FORMULA_WAREHOUSE_CHECK_SKIPPED:
    'The schema was saved without checking formulas against the warehouse. Check the Storage connection and Credential. Then save again.',
};

export function safeMcpSchemaWarnings(warnings: readonly FormulaViolation[]) {
  return warnings.slice(0, 50).map(warning => {
    const message = Object.hasOwn(WARNING_MESSAGES, warning.code)
      ? WARNING_MESSAGES[warning.code]
      : undefined;
    return message
      ? { code: warning.code, message }
      : {
          code: 'SCHEMA_WARNING',
          message: 'Review this schema warning in OWOX before using the affected fields.',
        };
  });
}
