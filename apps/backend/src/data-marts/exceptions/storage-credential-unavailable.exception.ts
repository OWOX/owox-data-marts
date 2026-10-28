import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/** A bound Storage cannot run because its Credential is disabled, lost its grant or lacks scopes. */
export class StorageCredentialUnavailableException extends BusinessViolationException {
  constructor(
    message: string,
    /** True when reconnecting the Google account is the fix. */
    public readonly reauthRequired: boolean
  ) {
    super(message, { reauthRequired }, 'STORAGE_CREDENTIAL_UNAVAILABLE');
    this.name = 'StorageCredentialUnavailableException';
  }
}
