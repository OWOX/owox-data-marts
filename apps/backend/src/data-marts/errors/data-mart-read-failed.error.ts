import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export class DataMartReadFailedException extends BusinessViolationException {
  constructor(readonly cause: Error) {
    super(
      'Failed to read data from this Data Mart. ' +
        'Check the Data Mart query and storage access, or contact the Data Mart owner. ' +
        `Details: ${cause.message}`,
      undefined,
      'DATA_MART_READ_FAILED'
    );
  }
}
