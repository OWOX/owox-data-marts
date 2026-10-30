import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/** A bound Data Mart configuration cannot run because its Credential is disabled or gone. */
export class SourceCredentialUnavailableException extends BusinessViolationException {
  constructor(message: string) {
    super(message, undefined, 'SOURCE_CREDENTIAL_UNAVAILABLE');
    this.name = 'SourceCredentialUnavailableException';
  }
}
