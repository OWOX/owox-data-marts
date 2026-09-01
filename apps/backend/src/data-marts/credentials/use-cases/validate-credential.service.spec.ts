import type { AuthorizationContext } from '../../../idp';
import { ValidateCredentialService } from './validate-credential.service';

describe('ValidateCredentialService', () => {
  it('persists the probe result before rebuilding the Credential view', async () => {
    const credential = {
      id: 'credential-1',
      projectId: 'project-1',
      secret: { value: 'provider-secret' },
      validationState: 'unknown',
      validationMessage: null,
      validatedAt: null,
    };
    const validation = {
      state: 'verified',
      message: 'accepted',
      validatedAt: new Date('2026-09-01T12:00:00.000Z'),
    } as const;
    const credentials = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(credential),
      save: jest.fn().mockResolvedValue(credential),
    };
    const view = { build: jest.fn().mockResolvedValue({ id: credential.id }) };
    const service = new ValidateCredentialService(
      credentials as never,
      { getForCredential: jest.fn().mockResolvedValue({}) } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      view as never,
      { run: jest.fn().mockResolvedValue(validation) } as never
    );

    await service.run('credential-1', {
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['editor'],
    } as AuthorizationContext);

    expect(credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        validationState: 'verified',
        validationMessage: 'accepted',
        validatedAt: validation.validatedAt,
      })
    );
    expect(view.build).toHaveBeenCalledWith(credential);
  });
});
