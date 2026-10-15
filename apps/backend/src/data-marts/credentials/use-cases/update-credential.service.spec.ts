jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
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
  const service = new UpdateCredentialService(
    credentials as never,
    definitions as never,
    { canAccess: jest.fn().mockResolvedValue(true) } as never,
    {} as never,
    { build: jest.fn().mockResolvedValue({ id: credential.id }) } as never,
    validationProbe as never,
    {} as never,
    {} as never
  );
  return { service, definitions, validationProbe, credentials, credential };
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
    displayName: 'Google Service Account',
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
});
