jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import type { AuthorizationContext } from '../../../idp';
import { UpdateCredentialService } from './update-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

function setup() {
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
    getForCredential: jest.fn().mockResolvedValue(definition),
    getForView: jest.fn().mockResolvedValue(definition),
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

  it('still allows a metadata-only update while definition consent is pending', async () => {
    const state = setup();

    await state.service.run('credential-1', context, { title: 'Renamed' });

    expect(state.definitions.getForView).toHaveBeenCalled();
    expect(state.definitions.getForCredential).not.toHaveBeenCalled();
  });
});
