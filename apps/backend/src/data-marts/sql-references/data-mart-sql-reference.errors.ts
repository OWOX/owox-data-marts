import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export enum DataMartSqlReferenceErrorCode {
  NOT_FOUND = 'DATA_MART_REFERENCE_NOT_FOUND',
  SELF = 'DATA_MART_REFERENCE_SELF',
  OTHER_STORAGE = 'DATA_MART_REFERENCE_OTHER_STORAGE',
  LEGACY_STORAGE = 'DATA_MART_REFERENCE_LEGACY_STORAGE',
  NO_DEFINITION = 'DATA_MART_REFERENCE_NO_DEFINITION',
  NOT_PUBLISHED = 'DATA_MART_REFERENCE_NOT_PUBLISHED',
  ACCESS_DENIED = 'DATA_MART_REFERENCE_ACCESS_DENIED',
  CYCLE = 'DATA_MART_REFERENCE_CYCLE',
  TOO_DEEP = 'DATA_MART_REFERENCE_TOO_DEEP',
  TOO_LONG = 'DATA_MART_REFERENCE_TOO_LONG',
  MULTI_STATEMENT = 'DATA_MART_REFERENCE_MULTI_STATEMENT',
}

/**
 * A Data Mart reference in a SQL query that cannot be used. The message is written for the
 * person editing the SQL and names the referenced Data Mart.
 */
export class DataMartSqlReferenceException extends BusinessViolationException {
  constructor(
    readonly referenceCode: DataMartSqlReferenceErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message, { ...details, code: referenceCode }, referenceCode);
  }
}

export function isDataMartSqlReferenceException(
  error: unknown
): error is DataMartSqlReferenceException {
  return error instanceof DataMartSqlReferenceException;
}
