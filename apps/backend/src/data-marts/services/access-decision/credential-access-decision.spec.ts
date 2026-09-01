import { RoleScope } from '../../enums/role-scope.enum';
import { AccessDecisionService } from './access-decision.service';
import { Action, EntityType } from './access-decision.types';

function setup(input: { owner: boolean; use: boolean; maintenance: boolean }) {
  const credentialRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'credential-1',
      availableForUse: input.use,
      availableForMaintenance: input.maintenance,
    }),
  };
  const credentialOwnerRepository = {
    count: jest.fn().mockResolvedValue(input.owner ? 1 : 0),
  };
  const contextAccess = {
    getRoleScope: jest.fn().mockResolvedValue(RoleScope.ENTIRE_PROJECT),
    hasContextOverlap: jest.fn().mockResolvedValue(true),
  };

  return new AccessDecisionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    contextAccess as never,
    credentialRepository as never,
    credentialOwnerRepository as never
  );
}

describe('Credential access decisions', () => {
  it('gives an owner full access regardless of project role and sharing', async () => {
    const access = setup({ owner: true, use: false, maintenance: false });
    await expect(
      access.canAccess(
        'member-1',
        ['viewer'],
        EntityType.CREDENTIAL,
        'credential-1',
        Action.MANAGE_OWNERS,
        'project-1'
      )
    ).resolves.toBe(true);
  });

  it('gives a non-owner only SEE and USE when shared for use', async () => {
    const access = setup({ owner: false, use: true, maintenance: false });
    await expect(
      access.canAccess(
        'member-1',
        ['viewer'],
        EntityType.CREDENTIAL,
        'credential-1',
        Action.USE,
        'project-1'
      )
    ).resolves.toBe(true);
    await expect(
      access.canAccess(
        'member-1',
        ['viewer'],
        EntityType.CREDENTIAL,
        'credential-1',
        Action.EDIT,
        'project-1'
      )
    ).resolves.toBe(false);
  });

  it('never adds COPY_CREDENTIALS to the Credential model', async () => {
    const access = setup({ owner: true, use: true, maintenance: true });
    await expect(
      access.canAccess(
        'member-1',
        ['viewer'],
        EntityType.CREDENTIAL,
        'credential-1',
        Action.COPY_CREDENTIALS,
        'project-1'
      )
    ).resolves.toBe(false);
  });
});
