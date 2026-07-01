import { RoleScope } from '../../enums/role-scope.enum';
import { ApplyUserProvisioningContextDefaultsService } from './apply-user-provisioning-context-defaults.service';

describe('ApplyUserProvisioningContextDefaultsService', () => {
  const PROJECT_ID = 'project-1';

  const createService = () => {
    const memberRoleScopeRepository = {
      find: jest.fn(),
      upsert: jest.fn(),
    };

    const service = new ApplyUserProvisioningContextDefaultsService(
      memberRoleScopeRepository as never
    );

    return { service, memberRoleScopeRepository };
  };

  it('writes explicit entire-project rows only for existing members without a local scope row', async () => {
    const { service, memberRoleScopeRepository } = createService();
    memberRoleScopeRepository.find.mockResolvedValue([
      { userId: 'user-with-scope', projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
    ]);

    await service.preserveExistingMembersAsEntireProject(PROJECT_ID, [
      'user-with-scope',
      'user-without-scope-1',
      'user-without-scope-2',
    ]);

    expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
      [
        {
          userId: 'user-without-scope-1',
          projectId: PROJECT_ID,
          roleScope: RoleScope.ENTIRE_PROJECT,
        },
        {
          userId: 'user-without-scope-2',
          projectId: PROJECT_ID,
          roleScope: RoleScope.ENTIRE_PROJECT,
        },
      ],
      ['userId', 'projectId']
    );
  });

  it('does not write rows when every existing member already has a local scope row', async () => {
    const { service, memberRoleScopeRepository } = createService();
    memberRoleScopeRepository.find.mockResolvedValue([
      { userId: 'user-1', projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
      { userId: 'user-2', projectId: PROJECT_ID, roleScope: RoleScope.ENTIRE_PROJECT },
    ]);

    await service.preserveExistingMembersAsEntireProject(PROJECT_ID, ['user-1', 'user-2']);

    expect(memberRoleScopeRepository.upsert).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty member list', async () => {
    const { service, memberRoleScopeRepository } = createService();

    await service.preserveExistingMembersAsEntireProject(PROJECT_ID, []);

    expect(memberRoleScopeRepository.find).not.toHaveBeenCalled();
    expect(memberRoleScopeRepository.upsert).not.toHaveBeenCalled();
  });
});
