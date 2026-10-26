import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { StorageCredentialUnavailableException } from './storage-credential-unavailable.exception';

describe('StorageCredentialUnavailableException', () => {
  it('is a coded business violation that keeps its message and flag', () => {
    const error = new StorageCredentialUnavailableException(
      "This Storage's Credential lost Google authorization.",
      true
    );

    expect(error).toBeInstanceOf(BusinessViolationException);
    expect(error.message).toBe("This Storage's Credential lost Google authorization.");
    expect(error.reauthRequired).toBe(true);
    expect(error.code).toBe('STORAGE_CREDENTIAL_UNAVAILABLE');
    expect(error.errorDetails).toEqual({ reauthRequired: true });
  });
});
