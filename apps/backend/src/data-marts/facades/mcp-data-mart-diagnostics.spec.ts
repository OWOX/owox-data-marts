import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  DataMartValidationCode,
  ValidationResult,
} from '../data-storage-types/interfaces/data-mart-validator.interface';
import { DATA_MART_ERROR_MESSAGES } from '../errors/data-mart-error-messages';
import {
  safeMcpDataMartErrorMessage,
  safeMcpSchemaWarnings,
  safeMcpDataMartValidationMessage,
} from './mcp-data-mart-diagnostics';

describe('MCP Data Mart diagnostics', () => {
  it('gives a fixed message for a calculated field type set from its formula result', () => {
    expect(
      safeMcpSchemaWarnings([
        { code: 'FORMULA_TYPE_SET_FROM_RESULT', field: 'flag', message: 'any' },
      ])
    ).toEqual([
      {
        code: 'FORMULA_TYPE_SET_FROM_RESULT',
        message:
          'A calculated field type did not match its formula result. OWOX changed the type to the result type.',
      },
    ]);
  });

  const connectorTablePathMessages = [
    DATA_MART_ERROR_MESSAGES.BIGQUERY_CONNECTOR_IDENTIFIER_INVALID,
    DATA_MART_ERROR_MESSAGES.ATHENA_CONNECTOR_IDENTIFIER_INVALID,
    DATA_MART_ERROR_MESSAGES.DUCKDB_IDENTIFIER_INVALID,
  ];

  it.each(connectorTablePathMessages)('gives the expected format on validate: %s', message => {
    const result = ValidationResult.authoredFailure(
      DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
      message
    );

    expect(safeMcpDataMartValidationMessage(result)).toBe(message);
  });

  it.each(connectorTablePathMessages)('gives the expected format on save: %s', message => {
    const error = new BusinessViolationException(
      message,
      undefined,
      DataMartValidationCode.INVALID_IDENTIFIER_FORMAT
    );

    expect(safeMcpDataMartErrorMessage(error)).toBe(message);
  });
});
