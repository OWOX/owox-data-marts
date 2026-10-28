import { Logger } from '@nestjs/common';
import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';

describe('ValidateDataStorageAccessService', () => {
  // The service and GoogleOAuthException log warnings these cases expect.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const storage = { id: 's1', type: 'GOOGLE_BIGQUERY', config: {}, credentialId: null };
  const command = { projectId: 'p', id: 's1' } as never;

  function create() {
    const facade = { validateAccess: jest.fn().mockResolvedValue(ValidationResult.success()) };
    const resolver = {
      hasCredentials: jest.fn().mockResolvedValue(true),
      resolve: jest.fn().mockResolvedValue({}),
      lostGrantFor: jest.fn().mockResolvedValue(null),
    };
    const service = new ValidateDataStorageAccessService(
      { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) } as never,
      facade as never,
      resolver as never,
      {} as never
    );
    return { service, facade, resolver };
  }

  it('returns the lost-grant message when a bound Storage is rejected by Google', async () => {
    const { service, facade, resolver } = create();
    facade.validateAccess.mockResolvedValue(
      ValidationResult.oauthReauthRequired('Reconnect the Credential')
    );
    resolver.lostGrantFor.mockResolvedValue(
      new StorageCredentialUnavailableException(
        "This Storage's Credential lost Google authorization.",
        true
      )
    );

    const result = await service.run(command);

    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
    expect(result.errorMessage).toBe("This Storage's Credential lost Google authorization.");
  });

  it('keeps the validator message for an unbound Storage', async () => {
    const { service, facade } = create();
    facade.validateAccess.mockResolvedValue(
      ValidationResult.oauthReauthRequired('Reconnect the Credential')
    );

    const result = await service.run(command);

    expect(result.errorMessage).toBe('Reconnect the Credential');
  });

  it('asks to reconnect the Credential when an old Google grant cannot be refreshed', async () => {
    const { service, resolver } = create();
    resolver.resolve.mockRejectedValue(new CredentialsExpiredException('s1', 'storage'));

    const result = await service.run(command);

    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
    expect(result.errorMessage).toBe(
      'Google authorization could not be refreshed. Reconnect the Credential on the Credentials page to restore access.'
    );
  });

  it('fails with the disabled message for a bound disabled Credential', async () => {
    const { service, resolver } = create();
    const message =
      "This Storage's Credential is disabled. A Credential maintainer can enable it on the Credentials page.";
    resolver.resolve.mockRejectedValue(new StorageCredentialUnavailableException(message, false));

    const result = await service.run(command);

    expect(result.valid).toBe(false);
    expect(result.code).not.toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
    expect(result.errorMessage).toBe(message);
  });

  it('logs only the message when resolving the credentials fails', async () => {
    const warned = jest.spyOn(Logger.prototype, 'warn');
    const { service, resolver } = create();
    resolver.resolve.mockRejectedValue(
      Object.assign(new Error('Lock wait timeout exceeded'), { parameters: ['secret-json'] })
    );

    await service.run(command);

    expect(warned).toHaveBeenCalledWith(
      'Failed to resolve credentials for storage s1: Lock wait timeout exceeded'
    );
  });
});
