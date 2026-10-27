import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/** A bound Destination cannot run because its Credential is disabled, lost its grant or lacks scopes. */
export class DestinationCredentialUnavailableException extends BusinessViolationException {
  constructor(
    message: string,
    /** True when reconnecting the Google account is the fix. */
    public readonly reauthRequired: boolean
  ) {
    super(message, { reauthRequired }, 'DESTINATION_CREDENTIAL_UNAVAILABLE');
    this.name = 'DestinationCredentialUnavailableException';
  }
}
