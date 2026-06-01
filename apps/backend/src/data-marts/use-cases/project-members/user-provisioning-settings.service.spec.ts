import { BadRequestException } from '@nestjs/common';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';
import { UpdateUserProvisioningSettingsCommand } from '../../dto/domain/user-provisioning-settings.dto';
import { GetUserProvisioningSettingsService } from './get-user-provisioning-settings.service';
import { UpdateUserProvisioningSettingsService } from './update-user-provisioning-settings.service';

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
  initializeTransactionalContext: jest.fn(),
}));

describe('GetUserProvisioningSettingsService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_USER_ID = 'actor-1';

  it('merges IDP organization settings with ODM-local context defaults', async () => {
    const idpProjectionsFacade = {
      getUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'automatic',
          defaultRole: ProjectRole.VIEWER,
        },
      }),
    };
    const contextSettingsService = {
      getEffectiveDefaultSettings: jest.fn().mockResolvedValue({
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1', 'ctx-2'],
      }),
    };

    const service = new GetUserProvisioningSettingsService(
      idpProjectionsFacade as never,
      contextSettingsService as never
    );

    await expect(service.run(PROJECT_ID, ACTOR_USER_ID)).resolves.toEqual({
      isApplicable: true,
      organization: {
        name: 'owox.com',
        mainProjectId: 'main-project',
        mainProjectTitle: 'Main Project',
      },
      settings: {
        mode: 'automatic',
        defaultRole: ProjectRole.VIEWER,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1', 'ctx-2'],
      },
    });

    expect(contextSettingsService.getEffectiveDefaultSettings).toHaveBeenCalledWith(
      PROJECT_ID,
      ProjectRole.VIEWER
    );
  });

  it('returns not-applicable response without touching ODM-local context defaults', async () => {
    const idpProjectionsFacade = {
      getUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: false,
        organization: null,
        settings: null,
      }),
    };
    const contextSettingsService = {
      getEffectiveDefaultSettings: jest.fn(),
    };

    const service = new GetUserProvisioningSettingsService(
      idpProjectionsFacade as never,
      contextSettingsService as never
    );

    await expect(service.run(PROJECT_ID, ACTOR_USER_ID)).resolves.toEqual({
      isApplicable: false,
      organization: null,
      settings: null,
    });
    expect(contextSettingsService.getEffectiveDefaultSettings).not.toHaveBeenCalled();
  });
});

describe('UpdateUserProvisioningSettingsService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_USER_ID = 'actor-1';

  it('persists local selected-context defaults only after successful IDP update', async () => {
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn().mockResolvedValue([
        {
          userId: 'existing-user-1',
          email: 'one@owox.com',
          displayName: undefined,
          avatarUrl: undefined,
          role: ProjectRole.VIEWER,
        },
        {
          userId: 'existing-user-2',
          email: 'two@owox.com',
          displayName: undefined,
          avatarUrl: undefined,
          role: ProjectRole.EDITOR,
        },
      ]),
      updateUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'manual',
          defaultRole: ProjectRole.VIEWER,
        },
      }),
    };
    const contextSettingsService = {
      normalizeAndValidate: jest.fn().mockResolvedValue({
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      }),
      saveDefaultSettings: jest.fn().mockResolvedValue({
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      }),
    };
    const applyDefaultsService = {
      preserveExistingMembersAsEntireProject: jest.fn(),
    };

    const service = new UpdateUserProvisioningSettingsService(
      idpProjectionsFacade as never,
      contextSettingsService as never,
      applyDefaultsService as never
    );

    const result = await service.run(
      new UpdateUserProvisioningSettingsCommand(
        PROJECT_ID,
        ACTOR_USER_ID,
        'manual',
        ProjectRole.VIEWER,
        RoleScope.SELECTED_CONTEXTS,
        ['ctx-1']
      )
    );

    expect(contextSettingsService.normalizeAndValidate).toHaveBeenCalledWith(
      PROJECT_ID,
      ProjectRole.VIEWER,
      RoleScope.SELECTED_CONTEXTS,
      ['ctx-1']
    );
    expect(applyDefaultsService.preserveExistingMembersAsEntireProject).toHaveBeenCalledWith(
      PROJECT_ID,
      ['existing-user-1', 'existing-user-2']
    );
    expect(idpProjectionsFacade.updateUserProvisioningSettings).toHaveBeenCalledWith(
      PROJECT_ID,
      ACTOR_USER_ID,
      {
        mode: 'manual',
        defaultRole: ProjectRole.VIEWER,
      }
    );
    expect(contextSettingsService.saveDefaultSettings).toHaveBeenCalledWith(PROJECT_ID, {
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['ctx-1'],
    });
    expect(
      idpProjectionsFacade.updateUserProvisioningSettings.mock.invocationCallOrder[0]
    ).toBeLessThan(
      applyDefaultsService.preserveExistingMembersAsEntireProject.mock.invocationCallOrder[0]
    );
    expect(
      idpProjectionsFacade.updateUserProvisioningSettings.mock.invocationCallOrder[0]
    ).toBeLessThan(contextSettingsService.saveDefaultSettings.mock.invocationCallOrder[0]);
    expect(
      applyDefaultsService.preserveExistingMembersAsEntireProject.mock.invocationCallOrder[0]
    ).toBeLessThan(contextSettingsService.saveDefaultSettings.mock.invocationCallOrder[0]);
    expect(result.settings).toEqual({
      mode: 'manual',
      defaultRole: ProjectRole.VIEWER,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['ctx-1'],
    });
  });

  it('does not persist local defaults when IDP returns not-applicable', async () => {
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn().mockResolvedValue([{ userId: 'existing-user-1' }]),
      updateUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: false,
        organization: null,
        settings: null,
      }),
    };
    const contextSettingsService = {
      normalizeAndValidate: jest.fn().mockResolvedValue({
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      }),
      saveDefaultSettings: jest.fn(),
    };
    const applyDefaultsService = {
      preserveExistingMembersAsEntireProject: jest.fn(),
    };

    const service = new UpdateUserProvisioningSettingsService(
      idpProjectionsFacade as never,
      contextSettingsService as never,
      applyDefaultsService as never
    );

    await expect(
      service.run(
        new UpdateUserProvisioningSettingsCommand(
          PROJECT_ID,
          ACTOR_USER_ID,
          'manual',
          ProjectRole.VIEWER,
          RoleScope.SELECTED_CONTEXTS,
          ['ctx-1']
        )
      )
    ).resolves.toEqual({
      isApplicable: false,
      organization: null,
      settings: null,
    });

    expect(contextSettingsService.saveDefaultSettings).not.toHaveBeenCalled();
    expect(applyDefaultsService.preserveExistingMembersAsEntireProject).not.toHaveBeenCalled();
  });

  it('does not preserve existing members when effective default is entire project', async () => {
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn(),
      updateUserProvisioningSettings: jest.fn().mockResolvedValue({
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'automatic',
          defaultRole: ProjectRole.ADMIN,
        },
      }),
    };
    const contextSettingsService = {
      normalizeAndValidate: jest.fn().mockResolvedValue({
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      }),
      saveDefaultSettings: jest.fn().mockResolvedValue({
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      }),
    };
    const applyDefaultsService = {
      preserveExistingMembersAsEntireProject: jest.fn(),
    };

    const service = new UpdateUserProvisioningSettingsService(
      idpProjectionsFacade as never,
      contextSettingsService as never,
      applyDefaultsService as never
    );

    await service.run(
      new UpdateUserProvisioningSettingsCommand(
        PROJECT_ID,
        ACTOR_USER_ID,
        'automatic',
        ProjectRole.ADMIN,
        RoleScope.SELECTED_CONTEXTS,
        ['ctx-1']
      )
    );

    expect(idpProjectionsFacade.getProjectMembersOrThrow).not.toHaveBeenCalled();
    expect(applyDefaultsService.preserveExistingMembersAsEntireProject).not.toHaveBeenCalled();
  });
});

describe('UserProvisioningContextSettingsService', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';

  const createService = () => {
    const settingsRepository = {
      findOne: jest.fn(),
      upsert: jest.fn(),
    };
    const settingsContextRepository = {
      find: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const memberRoleScopeRepository = {
      upsert: jest.fn(),
    };
    const memberRoleContextRepository = {
      delete: jest.fn(),
      save: jest.fn(),
    };
    const contextService = {
      validateContextIds: jest.fn(),
    };

    const service = new UserProvisioningContextSettingsService(
      settingsRepository as never,
      settingsContextRepository as never,
      memberRoleScopeRepository as never,
      memberRoleContextRepository as never,
      contextService as never
    );

    return {
      service,
      settingsRepository,
      settingsContextRepository,
      memberRoleScopeRepository,
      memberRoleContextRepository,
      contextService,
    };
  };

  it('forces admin defaults to entire project and skips context validation', async () => {
    const { service, contextService } = createService();

    await expect(
      service.normalizeAndValidate(PROJECT_ID, ProjectRole.ADMIN, RoleScope.SELECTED_CONTEXTS, [
        'ctx-1',
      ])
    ).resolves.toEqual({
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });

    expect(contextService.validateContextIds).not.toHaveBeenCalled();
  });

  it('requires at least one context for selected-context defaults', async () => {
    const { service } = createService();

    await expect(
      service.normalizeAndValidate(PROJECT_ID, ProjectRole.VIEWER, RoleScope.SELECTED_CONTEXTS, [])
    ).rejects.toThrow(BadRequestException);
  });

  it('applies selected-context default to a member without local scope', async () => {
    const {
      service,
      settingsRepository,
      settingsContextRepository,
      memberRoleScopeRepository,
      memberRoleContextRepository,
    } = createService();
    settingsRepository.findOne.mockResolvedValue({
      projectId: PROJECT_ID,
      roleScope: RoleScope.SELECTED_CONTEXTS,
    });
    settingsContextRepository.find.mockResolvedValue([
      { projectId: PROJECT_ID, contextId: 'ctx-1' },
      { projectId: PROJECT_ID, contextId: 'ctx-2' },
    ]);

    await expect(service.applyDefaultScopeToMember(USER_ID, PROJECT_ID)).resolves.toBe(
      RoleScope.SELECTED_CONTEXTS
    );

    expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
      { userId: USER_ID, projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
      ['userId', 'projectId']
    );
    expect(memberRoleContextRepository.delete).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
    });
    expect(memberRoleContextRepository.save).toHaveBeenCalledWith([
      { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-1' },
      { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-2' },
    ]);
  });

  it('keeps lazy entire-project default without writing member scope rows', async () => {
    const {
      service,
      settingsRepository,
      settingsContextRepository,
      memberRoleScopeRepository,
      memberRoleContextRepository,
    } = createService();
    settingsRepository.findOne.mockResolvedValue(null);
    settingsContextRepository.find.mockResolvedValue([]);

    await expect(service.applyDefaultScopeToMember(USER_ID, PROJECT_ID)).resolves.toBe(
      RoleScope.ENTIRE_PROJECT
    );

    expect(memberRoleScopeRepository.upsert).not.toHaveBeenCalled();
    expect(memberRoleContextRepository.delete).not.toHaveBeenCalled();
    expect(memberRoleContextRepository.save).not.toHaveBeenCalled();
  });
});
