jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import type { AuthorizationContext } from '../../../idp';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../services/builtin-credential-definitions';
import { UpdateCredentialService } from './update-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

function setup(definitionOverride?: object, credentialOverride: Record<string, unknown> = {}) {
  const credential = {
    id: 'credential-1',
    projectId: 'project-1',
    title: 'Credential',
    secret: { value: 'old-secret' },
    aiModelMappings: null,
    aiModelMappingModes: null,
    validationState: 'unknown',
    validationMessage: null,
    validatedAt: null,
    ...credentialOverride,
  };
  const definition = {
    definitionId: 'external-1',
    source: 'external',
    compatibilityLine: '1',
    contract: {
      id: 'acme',
      displayName: 'Acme',
      description: '',
      auth: { type: 'header', label: 'API key', headerName: 'authorization' },
      origins: ['https://api.acme.example'],
    },
  };
  const credentials = {
    getByIdAndProjectId: jest.fn().mockResolvedValue(credential),
    save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    listBindings: jest.fn().mockResolvedValue([]),
  };
  const definitions = {
    getForCredential: jest.fn().mockResolvedValue(definitionOverride ?? definition),
    getForView: jest.fn().mockResolvedValue(definitionOverride ?? definition),
  };
  const validationProbe = {
    run: jest.fn().mockResolvedValue({
      state: 'verified',
      message: 'accepted',
      validatedAt: new Date(),
    }),
  };
  const storageConsumers = { verifyCandidate: jest.fn().mockResolvedValue(0) };
  const destinationConsumers = { verifyCandidate: jest.fn().mockResolvedValue(0) };
  const service = new UpdateCredentialService(
    credentials as never,
    definitions as never,
    { canAccess: jest.fn().mockResolvedValue(true) } as never,
    {} as never,
    { build: jest.fn().mockResolvedValue({ id: credential.id }) } as never,
    validationProbe as never,
    {} as never,
    {} as never,
    storageConsumers as never,
    destinationConsumers as never
  );
  return {
    service,
    definitions,
    validationProbe,
    credentials,
    credential,
    storageConsumers,
    destinationConsumers,
  };
}

describe('UpdateCredentialService', () => {
  it('uses only the accepted runtime definition when replacing a secret', async () => {
    const state = setup();

    await state.service.run('credential-1', context, { secret: { value: 'new-secret' } });

    expect(state.definitions.getForCredential).toHaveBeenCalled();
    expect(state.definitions.getForView).not.toHaveBeenCalled();
    expect(state.validationProbe.run).toHaveBeenCalledWith(
      expect.objectContaining({ compatibilityLine: '1' }),
      { value: 'new-secret' }
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        validationState: 'verified',
        validationMessage: 'accepted',
        validatedAt: expect.any(Date),
      })
    );
  });

  it('writes the update from a fresh read, not the one taken before the probe', async () => {
    const state = setup();
    const fresh = { id: 'credential-1', title: 'Fresh', enabled: false };
    state.credentials.getByIdAndProjectId
      .mockResolvedValueOnce(state.credential)
      .mockResolvedValueOnce(fresh);

    await state.service.run('credential-1', context, { secret: { value: 'new-secret' } });

    const saved = state.credentials.save.mock.calls[0][0];
    expect(saved).toBe(fresh);
    expect(saved).toMatchObject({
      title: 'Fresh',
      enabled: false,
      secret: { value: 'new-secret' },
      validationState: 'verified',
    });
  });

  it('still allows a metadata-only update while definition consent is pending', async () => {
    const state = setup();

    await state.service.run('credential-1', context, { title: 'Renamed' });

    expect(state.definitions.getForView).toHaveBeenCalled();
    expect(state.definitions.getForCredential).not.toHaveBeenCalled();
  });
});

const googleDefinition = {
  definitionId: 'google-service-account',
  source: 'builtin',
  compatibilityLine: null,
  contract: {
    id: 'google-service-account',
    displayName: 'BigQuery Service Account',
    description: '',
    auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
    origins: ['https://*.googleapis.com'],
  },
};
const savedMetadata = {
  clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
  projectId: 'acme-docs',
  privateKeyId: 'key-1',
};

describe('UpdateCredentialService with a Google service account key', () => {
  it('refuses a replacement key for another service account before asking Google', async () => {
    const state = setup(googleDefinition, { publicMetadata: savedMetadata });

    await expect(
      state.service.run('credential-1', context, {
        secret: {
          value: serviceAccountKey({ client_email: 'other@acme-docs.iam.gserviceaccount.com' }),
        },
      })
    ).rejects.toThrow(
      new BadRequestException(
        'The replacement key must belong to docs-writer@acme-docs.iam.gserviceaccount.com. Create another Credential for a different service account.'
      )
    );
    expect(state.validationProbe.run).not.toHaveBeenCalled();
    expect(state.credentials.save).not.toHaveBeenCalled();
  });

  it('falls back to the stored key when the metadata is missing, with the same refusal', async () => {
    const state = setup(googleDefinition, {
      publicMetadata: null,
      secret: {
        value: serviceAccountKey({ client_email: 'docs-writer@acme-docs.iam.gserviceaccount.com' }),
      },
    });

    await expect(
      state.service.run('credential-1', context, {
        secret: {
          value: serviceAccountKey({ client_email: 'other@acme-docs.iam.gserviceaccount.com' }),
        },
      })
    ).rejects.toThrow(
      new BadRequestException(
        'The replacement key must belong to docs-writer@acme-docs.iam.gserviceaccount.com. Create another Credential for a different service account.'
      )
    );
    expect(state.validationProbe.run).not.toHaveBeenCalled();
  });

  it('accepts a new key of the same service account whatever the letter case, before the transaction', async () => {
    const state = setup(googleDefinition, { publicMetadata: savedMetadata });
    const apply = jest.spyOn(
      state.service as unknown as { apply: (...args: unknown[]) => Promise<unknown> },
      'apply'
    );

    await state.service.run('credential-1', context, {
      secret: {
        value: serviceAccountKey({
          client_email: 'Docs-Writer@acme-docs.iam.gserviceaccount.com',
          private_key_id: 'key-2',
        }),
      },
    });

    expect(state.validationProbe.run.mock.invocationCallOrder[0]).toBeLessThan(
      apply.mock.invocationCallOrder[0]
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: {
          clientEmail: 'Docs-Writer@acme-docs.iam.gserviceaccount.com',
          projectId: 'acme-docs',
          privateKeyId: 'key-2',
          clientId: '1234567890',
        },
      })
    );
  });

  it('saves nothing when Google rejects the replacement key', async () => {
    const state = setup(googleDefinition, { publicMetadata: savedMetadata });
    state.validationProbe.run.mockResolvedValue({
      state: 'rejected',
      message: 'invalid_grant: Invalid JWT Signature.',
      validatedAt: new Date(),
    });

    await expect(
      state.service.run('credential-1', context, { secret: { value: serviceAccountKey() } })
    ).rejects.toThrow(new BadRequestException('invalid_grant: Invalid JWT Signature.'));
    expect(state.credentials.save).not.toHaveBeenCalled();
  });

  it('checks the replacement key on the Destinations that use it, after Google accepts it', async () => {
    const state = setup(googleDefinition, {
      definitionId: 'google-service-account',
      publicMetadata: savedMetadata,
    });
    const bindings = [{ consumerType: 'destination', consumerId: 'destination-1' }];
    state.credentials.listBindings.mockResolvedValue(bindings);
    const key = serviceAccountKey({ private_key_id: 'key-2' });

    await state.service.run('credential-1', context, { secret: { value: key } });

    expect(state.destinationConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      bindings,
      {
        definitionId: 'google-service-account',
        secret: { value: key },
        publicMetadata: { ...savedMetadata, privateKeyId: 'key-2', clientId: '1234567890' },
      },
      {
        definitionId: 'google-service-account',
        secret: { value: 'old-secret' },
        publicMetadata: savedMetadata,
      }
    );
    expect(state.validationProbe.run.mock.invocationCallOrder[0]).toBeLessThan(
      state.destinationConsumers.verifyCandidate.mock.invocationCallOrder[0]
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({ secret: { value: key }, validationState: 'verified' })
    );
  });

  it('skips the Destination check when Google leaves the probe unknown', async () => {
    const state = setup(googleDefinition, { publicMetadata: savedMetadata });
    state.validationProbe.run.mockResolvedValue({
      state: 'unknown',
      message: 'Google is unreachable',
      validatedAt: new Date(),
    });
    const key = serviceAccountKey();

    await state.service.run('credential-1', context, { secret: { value: key } });

    expect(state.destinationConsumers.verifyCandidate).not.toHaveBeenCalled();
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({ secret: { value: key }, validationState: 'unknown' })
    );
  });

  it('saves nothing when a Destination refuses the replacement key', async () => {
    const state = setup(googleDefinition, { publicMetadata: savedMetadata });
    state.destinationConsumers.verifyCandidate.mockRejectedValue(
      new AccessValidationException('The new values do not work for the Destinations')
    );

    await expect(
      state.service.run('credential-1', context, { secret: { value: serviceAccountKey() } })
    ).rejects.toBeInstanceOf(AccessValidationException);
    expect(state.credentials.save).not.toHaveBeenCalled();
  });
});

describe('UpdateCredentialService with a Google Chat webhook', () => {
  const stored = {
    definitionId: 'google-chat-webhook',
    secret: {
      fields: { webhookUrl: 'https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t' },
    },
    publicMetadata: { fields: {} },
    validationState: 'unknown',
  };

  it('checks a replaced URL on the Destinations that use it and keeps the validation unknown', async () => {
    const state = setup(builtin('google-chat-webhook'), stored);
    const bindings = [
      { consumerType: 'destination', consumerId: 'destination-1' },
      { consumerType: 'destination', consumerId: 'destination-2' },
    ];
    state.credentials.listBindings.mockResolvedValue(bindings);
    // A webhook check is format-only, so the Destinations count 0.
    state.destinationConsumers.verifyCandidate.mockResolvedValue(0);
    const webhookUrl = 'https://chat.googleapis.com/v1/spaces/B/messages?key=k&token=t';

    await state.service.run('credential-1', context, { fields: { webhookUrl } });

    const candidate = {
      definitionId: 'google-chat-webhook',
      secret: { fields: { webhookUrl } },
      publicMetadata: { fields: {} },
    };
    expect(state.storageConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      bindings,
      candidate,
      {
        definitionId: stored.definitionId,
        secret: stored.secret,
        publicMetadata: stored.publicMetadata,
      }
    );
    expect(state.destinationConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      bindings,
      candidate,
      {
        definitionId: stored.definitionId,
        secret: stored.secret,
        publicMetadata: stored.publicMetadata,
      }
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: { fields: { webhookUrl } },
        validationState: 'unknown',
        validationMessage: null,
        validatedAt: null,
      })
    );
  });

  it('keeps the stored URL when only the title changes', async () => {
    const state = setup(builtin('google-chat-webhook'), stored);

    await state.service.run('credential-1', context, { title: 'Sales space' });

    expect(state.destinationConsumers.verifyCandidate).not.toHaveBeenCalled();
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sales space', secret: stored.secret })
    );
  });
});

function builtin(id: string) {
  const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(definition => definition.id === id);
  return { definitionId: id, source: 'builtin', compatibilityLine: null, contract };
}

describe('UpdateCredentialService with a field set', () => {
  const snowflake = builtin('snowflake-password');
  const stored = {
    definitionId: 'snowflake-password',
    secret: { fields: { password: 'old-password' } },
    publicMetadata: { fields: { username: 'loader' } },
    validationState: 'verified',
    validationMessage: 'accepted',
    validatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const bindings = [
    { consumerType: 'storage', consumerId: 'storage-1' },
    { consumerType: 'storage', consumerId: 'storage-2' },
  ];

  it('resets the validation to unknown when no Storage uses the Credential', async () => {
    const state = setup(snowflake, stored);

    await state.service.run('credential-1', context, { fields: { password: 'new-password' } });

    expect(state.definitions.getForCredential).toHaveBeenCalled();
    expect(state.validationProbe.run).not.toHaveBeenCalled();
    expect(state.storageConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      [],
      {
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'new-password' } },
        publicMetadata: { fields: { username: 'loader' } },
      },
      {
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'old-password' } },
        publicMetadata: { fields: { username: 'loader' } },
      }
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: { fields: { password: 'new-password' } },
        publicMetadata: { fields: { username: 'loader' } },
        validationState: 'unknown',
        validationMessage: null,
        validatedAt: null,
      })
    );
  });

  it('keeps the validation when the identity is sent again unchanged', async () => {
    const state = setup(snowflake, stored);

    await state.service.run('credential-1', context, { fields: { username: 'loader' } });

    expect(state.storageConsumers.verifyCandidate).not.toHaveBeenCalled();
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: { fields: { password: 'old-password' } },
        publicMetadata: { fields: { username: 'loader' } },
        validationState: 'verified',
        validationMessage: 'accepted',
        validatedAt: stored.validatedAt,
      })
    );
  });

  it('checks a new identity against every bound Storage and resets the validation', async () => {
    const state = setup(snowflake, stored);
    state.credentials.listBindings.mockResolvedValue(bindings);
    state.storageConsumers.verifyCandidate.mockResolvedValue(2);

    await state.service.run('credential-1', context, { fields: { username: 'reporter' } });

    expect(state.storageConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      bindings,
      {
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'old-password' } },
        publicMetadata: { fields: { username: 'reporter' } },
      },
      {
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'old-password' } },
        publicMetadata: { fields: { username: 'loader' } },
      }
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: { fields: { username: 'reporter' } },
        validationState: 'verified',
        validatedAt: expect.any(Date),
      })
    );
    expect(state.credentials.save.mock.calls[0][0].validatedAt).not.toBe(stored.validatedAt);
  });

  it('saves nothing when a bound Storage rejects a replaced AWS secret', async () => {
    const state = setup(builtin('aws-access-key'), {
      definitionId: 'aws-access-key',
      secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
    });
    state.credentials.listBindings.mockResolvedValue(bindings);
    state.storageConsumers.verifyCandidate.mockRejectedValue(
      new AccessValidationException(
        'The new values do not work for Storage "Athena prod": Access validation failed'
      )
    );

    const error = await state.service
      .run('credential-1', context, { fields: { secretAccessKey: 'typo-secret-access-key' } })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AccessValidationException);
    expect(state.storageConsumers.verifyCandidate).toHaveBeenCalledWith(
      context,
      bindings,
      expect.objectContaining({
        secret: { fields: { secretAccessKey: 'typo-secret-access-key' } },
      }),
      expect.objectContaining({ secret: { fields: { secretAccessKey: 'old-secret-access-key' } } })
    );
    expect(state.credentials.save).not.toHaveBeenCalled();
  });

  it('marks the Credential verified when every bound Storage accepts the new values, before the transaction', async () => {
    const state = setup(builtin('aws-access-key'), {
      definitionId: 'aws-access-key',
      secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
      validationState: 'unknown',
    });
    state.credentials.listBindings.mockResolvedValue(bindings);
    state.storageConsumers.verifyCandidate.mockResolvedValue(2);
    const apply = jest.spyOn(
      state.service as unknown as { apply: (...args: unknown[]) => Promise<unknown> },
      'apply'
    );

    await state.service.run('credential-1', context, {
      fields: { secretAccessKey: 'new-secret-access-key' },
    });

    expect(state.storageConsumers.verifyCandidate.mock.invocationCallOrder[0]).toBeLessThan(
      apply.mock.invocationCallOrder[0]
    );
    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: { fields: { secretAccessKey: 'new-secret-access-key' } },
        validationState: 'verified',
        validationMessage: expect.any(String),
        validatedAt: expect.any(Date),
      })
    );
  });

  it('saves unknown, not verified, when a concurrent edit changed the checked values', async () => {
    const stored = {
      definitionId: 'aws-access-key',
      secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
      validationState: 'verified',
    };
    const state = setup(builtin('aws-access-key'), stored);
    state.credentials.getByIdAndProjectId.mockResolvedValueOnce(stored).mockResolvedValueOnce({
      ...stored,
      publicMetadata: { fields: { accessKeyId: 'key-id-2' } },
    });
    state.credentials.listBindings.mockResolvedValue(bindings);
    state.storageConsumers.verifyCandidate.mockResolvedValue(2);

    await state.service.run('credential-1', context, {
      fields: { secretAccessKey: 'new-secret-access-key' },
    });

    expect(state.credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: { fields: { secretAccessKey: 'new-secret-access-key' } },
        publicMetadata: { fields: { accessKeyId: 'key-id-2' } },
        validationState: 'unknown',
        validationMessage: null,
        validatedAt: null,
      })
    );
  });

  describe('bound to a Storage and a Destination', () => {
    const mixed = [
      { consumerType: 'storage', consumerId: 'storage-1' },
      { consumerType: 'destination', consumerId: 'destination-1' },
    ];
    const aws = {
      definitionId: 'aws-access-key',
      secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
      publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
      validationState: 'unknown',
    };
    const edit = { fields: { secretAccessKey: 'new-secret-access-key' } };

    it('saves nothing when the Destination rejects after the Storage accepts', async () => {
      const state = setup(builtin('aws-access-key'), aws);
      state.credentials.listBindings.mockResolvedValue(mixed);
      state.storageConsumers.verifyCandidate.mockResolvedValue(1);
      state.destinationConsumers.verifyCandidate.mockRejectedValue(
        new AccessValidationException('The new values do not work for the Destinations')
      );

      await expect(state.service.run('credential-1', context, edit)).rejects.toBeInstanceOf(
        AccessValidationException
      );
      expect(state.credentials.save).not.toHaveBeenCalled();
    });

    it('does not reach the Destination when the Storage rejects', async () => {
      const state = setup(builtin('aws-access-key'), aws);
      state.credentials.listBindings.mockResolvedValue(mixed);
      state.storageConsumers.verifyCandidate.mockRejectedValue(
        new AccessValidationException('The new values do not work for Storage "Athena prod"')
      );

      await expect(state.service.run('credential-1', context, edit)).rejects.toBeInstanceOf(
        AccessValidationException
      );
      expect(state.destinationConsumers.verifyCandidate).not.toHaveBeenCalled();
      expect(state.credentials.save).not.toHaveBeenCalled();
    });

    it.each([
      [0, 0, 'unknown'],
      [1, 0, 'verified'],
      [0, 1, 'verified'],
    ])(
      'counts Storages %i and Destinations %i together: %s',
      async (storageCount, destinationCount, validationState) => {
        const state = setup(builtin('aws-access-key'), aws);
        state.credentials.listBindings.mockResolvedValue(mixed);
        state.storageConsumers.verifyCandidate.mockResolvedValue(storageCount);
        state.destinationConsumers.verifyCandidate.mockResolvedValue(destinationCount);

        await state.service.run('credential-1', context, edit);

        expect(state.credentials.save).toHaveBeenCalledWith(
          expect.objectContaining({
            validationState,
            validationMessage:
              validationState === 'verified'
                ? 'Everything that uses this Credential accepted the new values.'
                : null,
          })
        );
      }
    );
  });

  it('refuses a secret value for a field set', async () => {
    const state = setup(snowflake, stored);

    await expect(
      state.service.run('credential-1', context, { secret: { value: 'new-password' } })
    ).rejects.toThrow(BadRequestException);
    expect(state.credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a secret value that would overwrite OAuth tokens', async () => {
    const state = setup(builtin('google-oauth'), {
      secret: { oauth: { provider: 'google', clientId: 'client-1', tokens: {} } },
    });

    await expect(
      state.service.run('credential-1', context, { secret: { value: 'token' } })
    ).rejects.toThrow(BadRequestException);
    expect(state.validationProbe.run).not.toHaveBeenCalled();
    expect(state.credentials.save).not.toHaveBeenCalled();
  });
});
