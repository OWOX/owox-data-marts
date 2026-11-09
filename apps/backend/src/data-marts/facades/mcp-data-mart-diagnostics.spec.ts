import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  DataMartValidationCode,
  ValidationResult,
} from '../data-storage-types/interfaces/data-mart-validator.interface';
import { DATA_MART_ERROR_MESSAGES } from '../errors/data-mart-error-messages';
import {
  safeMcpDataMartErrorMessage,
  safeMcpDataMartValidationMessage,
} from './mcp-data-mart-diagnostics';

describe('MCP Data Mart diagnostics', () => {
  const connectorTablePathMessages = [
    DATA_MART_ERROR_MESSAGES.BIGQUERY_CONNECTOR_IDENTIFIER_INVALID,
    DATA_MART_ERROR_MESSAGES.ATHENA_CONNECTOR_IDENTIFIER_INVALID,
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
