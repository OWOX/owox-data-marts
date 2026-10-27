import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DestinationCredentialUnavailableException } from './destination-credential-unavailable.exception';

describe('DestinationCredentialUnavailableException', () => {
  it('is a coded business violation that keeps its message and flag', () => {
    const error = new DestinationCredentialUnavailableException(
      "This Destination's Credential lost Google authorization.",
      true
    );

    expect(error).toBeInstanceOf(BusinessViolationException);
    expect(error.message).toBe("This Destination's Credential lost Google authorization.");
    expect(error.reauthRequired).toBe(true);
    expect(error.code).toBe('DESTINATION_CREDENTIAL_UNAVAILABLE');
    expect(error.errorDetails).toEqual({ reauthRequired: true });
  });
});
