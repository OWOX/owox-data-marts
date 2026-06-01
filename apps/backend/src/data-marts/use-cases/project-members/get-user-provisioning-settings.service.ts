import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { UserProvisioningSettingsDto } from '../../dto/domain/user-provisioning-settings.dto';
import { ProjectRole } from '../../enums/project-role.enum';
import { UserProvisioningContextSettingsService } from '../../services/context/user-provisioning-context-settings.service';

@Injectable()
export class GetUserProvisioningSettingsService {
  constructor(
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly contextSettingsService: UserProvisioningContextSettingsService
  ) {}

  async run(projectId: string, actorUserId: string): Promise<UserProvisioningSettingsDto> {
    const idpSettings = await this.idpProjectionsFacade.getUserProvisioningSettings(
      projectId,
      actorUserId
    );

    if (!idpSettings.isApplicable || !idpSettings.organization || !idpSettings.settings) {
      return {
        isApplicable: false,
        isMainProject: false,
        organization: null,
        settings: null,
      };
    }

    const defaultRole = idpSettings.settings.defaultRole as ProjectRole;
    const mainProjectId = idpSettings.organization?.mainProjectName ?? null;
    const contextDefaults = await this.contextSettingsService.getEffectiveDefaultSettings(
      projectId,
      defaultRole
    );

    return {
      isApplicable: true,
      isMainProject: mainProjectId === projectId,
      organization: idpSettings.organization
        ? {
            name: idpSettings.organization.name,
            mainProjectId,
            mainProjectTitle: idpSettings.organization.mainProjectTitle ?? null,
          }
        : null,
      settings: {
        mode: idpSettings.settings.mode,
        defaultRole,
        roleScope: contextDefaults.roleScope,
        contextIds: contextDefaults.contextIds,
      },
    };
  }
}
