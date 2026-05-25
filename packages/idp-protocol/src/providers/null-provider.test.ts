import { describe, expect, it } from '@jest/globals';
import { IdpOperationNotSupportedError } from '../types/errors.js';
import { NullIdpProvider } from './null-provider.js';

describe('NullIdpProvider user provisioning settings', () => {
  it('returns not applicable settings', async () => {
    const provider = new NullIdpProvider();

    await expect(provider.getUserProvisioningSettings('project-1', 'actor-1')).resolves.toEqual({
      isApplicable: false,
      organization: null,
      settings: null,
    });
  });

  it('throws when updating settings', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.updateUserProvisioningSettings('project-1', 'actor-1', {
        mode: 'automatic',
        defaultRole: 'viewer',
      })
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
  });

  it('throws for request-access operations', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.getUserProvisioningRequestAccessContext('user-1', 'project-1')
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
    await expect(
      provider.requestProjectAccess('user-1', 'project-1', 'viewer')
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
    await expect(provider.createNewProject('user-1', 'extension-v2')).rejects.toBeInstanceOf(
      IdpOperationNotSupportedError
    );
  });
});

describe('NullIdpProvider project member API keys', () => {
  it('issues a development API-key access token with authFlow and apiKeyId claims', async () => {
    const provider = new NullIdpProvider();

    const result = await provider.issueAccessTokenForProjectMemberApiKey(
      'pmk_AbCdEfGhIjKlMnOpQrStUv',
      'user-1',
      'project-1',
      null,
      false
    );

    await expect(provider.parseToken(result.accessToken)).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
  });

  it('uses the explicit key role when one is provided', async () => {
    const provider = new NullIdpProvider();

    const result = await provider.issueAccessTokenForProjectMemberApiKey(
      'pmk_AbCdEfGhIjKlMnOpQrStUv',
      'user-1',
      'project-1',
      'viewer',
      false
    );

    await expect(provider.introspectToken(result.accessToken)).resolves.toEqual(
      expect.objectContaining({ roles: ['viewer'] })
    );
  });
});
