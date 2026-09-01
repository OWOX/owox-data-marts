jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DeleteCredentialService } from './delete-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['viewer'],
} as never;

function setup() {
  const credentials = {
    getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'credential-1' }),
    lockActiveByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'credential-1' }),
    countActiveBindings: jest.fn().mockResolvedValue(0),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  return {
    service: new DeleteCredentialService(credentials as never, access as never),
    credentials,
  };
}

describe('DeleteCredentialService', () => {
  it('locks the active Credential before checking references and deleting it', async () => {
    const state = setup();

    await state.service.run('credential-1', context);

    expect(state.credentials.lockActiveByIdAndProjectId).toHaveBeenCalledWith(
      'credential-1',
      'project-1'
    );
    expect(state.credentials.lockActiveByIdAndProjectId.mock.invocationCallOrder[0]).toBeLessThan(
      state.credentials.countActiveBindings.mock.invocationCallOrder[0]!
    );
    expect(state.credentials.softDelete).toHaveBeenCalledWith('credential-1', 'project-1');
  });

  it('keeps the Credential when a binding acquired the lock first', async () => {
    const state = setup();
    state.credentials.countActiveBindings.mockResolvedValue(1);

    await expect(state.service.run('credential-1', context)).rejects.toBeInstanceOf(
      BusinessViolationException
    );
    expect(state.credentials.softDelete).not.toHaveBeenCalled();
  });
});
