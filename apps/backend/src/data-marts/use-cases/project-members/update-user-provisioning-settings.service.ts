import { Injectable } from '@nestjs/common';
import type { Role as IdpRole } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import {
  UpdateUserProvisioningSettingsCommand,
  UserProvisioningSettingsDto,
} from '../../dto/domain/user-provisioning-settings.dto';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ApplyUserProvisioningContextDefaultsService } from '../../services/context/apply-user-provisioning-context-defaults.service';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';

@Injectable()
export class UpdateUserProvisioningSettingsService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextSettingsService: UserProvisioningContextSettingsService,
    private readonly applyDefaultsService: ApplyUserProvisioningContextDefaultsService
  ) {}

  async run(command: UpdateUserProvisioningSettingsCommand): Promise<UserProvisioningSettingsDto> {
    const { projectId, actorUserId, mode, defaultRole, roleScope, contextIds } = command;
    const contextDefaults = await this.contextSettingsService.normalizeAndValidate(
      projectId,
      defaultRole,
      roleScope,
      contextIds
    );

    if (contextDefaults.roleScope === RoleScope.SELECTED_CONTEXTS) {
      const members = await this.idpProjectionsFacade.getProjectMembersOrThrow(projectId);
      await this.applyDefaultsService.preserveExistingMembersAsEntireProject(
        projectId,
        members.map(member => member.userId)
      );
    }

    const shouldSaveLocalDefaultsFirst = contextDefaults.roleScope === RoleScope.SELECTED_CONTEXTS;
    const savedContextDefaults = shouldSaveLocalDefaultsFirst
      ? await this.contextSettingsService.saveDefaultSettings(projectId, contextDefaults)
      : null;

    const idpSettings = await this.idpProjectionsFacade.updateUserProvisioningSettings(
      projectId,
      actorUserId,
      {
        mode,
        defaultRole: defaultRole as IdpRole,
      }
    );

    if (!idpSettings.isApplicable || !idpSettings.settings) {
      return {
        isApplicable: false,
        organization: null,
        settings: null,
      };
    }

    const effectiveContextDefaults =
      savedContextDefaults ??
      (await this.contextSettingsService.saveDefaultSettings(projectId, contextDefaults));
    const savedDefaultRole = idpSettings.settings.defaultRole as ProjectRole;

    return {
      isApplicable: true,
      organization: idpSettings.organization
        ? {
            name: idpSettings.organization.name,
            mainProjectId: idpSettings.organization.mainProjectName ?? null,
            mainProjectTitle: idpSettings.organization.mainProjectTitle ?? null,
          }
        : null,
      settings: {
        mode: idpSettings.settings.mode,
        defaultRole: savedDefaultRole,
        roleScope: effectiveContextDefaults.roleScope,
        contextIds: effectiveContextDefaults.contextIds,
      },
    };
  }
}
