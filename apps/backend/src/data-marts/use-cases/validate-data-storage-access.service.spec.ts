import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { Action, EntityType } from '../services/access-decision';

describe('ValidateDataStorageAccessService', () => {
  // The service and GoogleOAuthException log warnings these cases expect.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const storage = {
    id: 's1',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'test-project', location: 'US' },
    credentialId: null,
  };
  const command = new ValidateDataStorageAccessCommand('s1', 'p', 'user', ['editor']);

  function create() {
    const storages = { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const facade = { validateAccess: jest.fn().mockResolvedValue(ValidationResult.success()) };
    const resolver = {
      hasCredentials: jest.fn().mockResolvedValue(true),
      resolve: jest.fn().mockResolvedValue({}),
      lostGrantFor: jest.fn().mockResolvedValue(null),
    };
    const service = new ValidateDataStorageAccessService(
      storages as never,
      facade as never,
      resolver as never,
      access as never
    );
    return { service, storages, access, facade, resolver };
  }

  it('requires project-scoped USE access before inspecting the saved configuration', async () => {
    const { service, storages, access, facade, resolver } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: {} });
    access.canAccess.mockResolvedValue(false);

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);

    expect(storages.getByProjectIdAndId).toHaveBeenCalledWith('p', 's1');
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.STORAGE,
      's1',
      Action.USE,
      'p'
    );
    expect(resolver.hasCredentials).not.toHaveBeenCalled();
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('does not validate a Storage from another project', async () => {
    const { service, storages, resolver } = create();
    storages.getByProjectIdAndId.mockRejectedValue(new NotFoundException());

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(resolver.hasCredentials).not.toHaveBeenCalled();
  });

  it('reports invalid configuration with field details before resolving credentials', async () => {
    const { service, storages, facade, resolver } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: {} });

    const result = await service.run(command);

    expect(result).toMatchObject({
      valid: false,
      code: 'INVALID_CONFIGURATION',
      errorMessage: 'Invalid config — projectId is required',
      reason: {
        errors: [
          expect.objectContaining({ path: ['projectId'], message: 'projectId is required' }),
        ],
        fieldErrors: [{ field: 'config.projectId', message: 'projectId is required' }],
      },
    });
    expect(resolver.hasCredentials).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('reports missing Credentials as unconfigured even when the saved config is invalid', async () => {
    const { service, storages, resolver, facade } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: {} });
    resolver.hasCredentials.mockResolvedValue(false);

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      code: ValidationResultCode.UNCONFIGURED,
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('reports missing configuration as unconfigured', async () => {
    const { service, storages, resolver } = create();
    storages.getByProjectIdAndId.mockResolvedValue({ ...storage, config: null });

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      code: ValidationResultCode.UNCONFIGURED,
      errorMessage: 'Complete setup to activate Storage',
    });
    expect(resolver.hasCredentials).not.toHaveBeenCalled();
  });

  it('reports missing credentials as unconfigured', async () => {
    const { service, facade, resolver } = create();
    resolver.hasCredentials.mockResolvedValue(false);

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      code: ValidationResultCode.UNCONFIGURED,
      errorMessage: 'Complete setup to activate Storage',
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('validates the saved configuration with the resolved credentials', async () => {
    const { service, facade, resolver } = create();
    const credentials = { type: 'service_account', private_key: 'key' };
    resolver.resolve.mockResolvedValue(credentials);

    await expect(service.run(command)).resolves.toMatchObject({ valid: true });
    expect(facade.validateAccess).toHaveBeenCalledWith(storage.type, storage.config, credentials);
  });

  it('preserves a provider validation failure and its details', async () => {
    const { service, facade } = create();
    facade.validateAccess.mockResolvedValue(
      ValidationResult.failure('Dataset is unavailable', { dataset: 'analytics' })
    );

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      errorMessage: 'Dataset is unavailable',
      reason: { dataset: 'analytics' },
    });
  });

  it('returns a validation failure when the credential lookup fails', async () => {
    const { service, facade, resolver } = create();
    resolver.hasCredentials.mockRejectedValue(new Error('Credential lookup failed'));

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      errorMessage: 'Credential lookup failed',
    });
    expect(facade.validateAccess).not.toHaveBeenCalled();
  });

  it('asks to reconnect when a bound Credential needs authorization', async () => {
    const { service, resolver } = create();
    resolver.resolve.mockRejectedValue(
      new StorageCredentialUnavailableException('Reconnect the saved Credential', true)
    );

    await expect(service.run(command)).resolves.toMatchObject({
      valid: false,
      code: ValidationResultCode.OAUTH_REAUTH_REQUIRED,
      errorMessage: 'Reconnect the saved Credential',
    });
  });

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
    expect(result.code).toBe('CREDENTIAL_UNAVAILABLE');
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
