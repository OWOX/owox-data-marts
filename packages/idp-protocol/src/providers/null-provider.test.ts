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
});
