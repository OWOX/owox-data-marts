import type { AuthorizationContext } from '../../../idp';
import { ValidateCredentialService } from './validate-credential.service';

describe('ValidateCredentialService', () => {
  const validation = {
    state: 'verified',
    message: 'accepted',
    validatedAt: new Date('2026-09-01T12:00:00.000Z'),
  } as const;
  const context = {
    projectId: 'project-1',
    userId: 'member-1',
    roles: ['editor'],
  } as AuthorizationContext;

  function setup(fresh: unknown) {
    const checked = { id: 'credential-1', secret: { value: 'provider-secret' }, enabled: true };
    const credentials = {
      getByIdAndProjectId: jest.fn().mockResolvedValueOnce(checked).mockResolvedValue(fresh),
      writeValidation: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
    };
    const view = { build: jest.fn().mockResolvedValue({ id: 'credential-1' }) };
    const service = new ValidateCredentialService(
      credentials as never,
      { getForCredential: jest.fn().mockResolvedValue({}) } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      view as never,
      { run: jest.fn().mockResolvedValue(validation) } as never
    );
    return { service, credentials, view, checked };
  }

  it('writes only the validation columns for the checked key and views a fresh read', async () => {
    const fresh = { id: 'credential-1', secret: { value: 'provider-secret' }, enabled: false };
    const { service, credentials, view, checked } = setup(fresh);

    await service.run('credential-1', context);

    expect(credentials.writeValidation).toHaveBeenCalledWith(
      'credential-1',
      checked.secret,
      validation
    );
    expect(credentials.save).not.toHaveBeenCalled();
    expect(view.build).toHaveBeenCalledWith(fresh);
    expect(checked.enabled).toBe(true);
  });
});
