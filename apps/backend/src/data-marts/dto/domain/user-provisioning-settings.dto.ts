import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';

export type UserProvisioningMode = 'automatic' | 'manual';

export interface UserProvisioningOrganizationDto {
  name: string;
  mainProjectId?: string | null;
  mainProjectTitle?: string | null;
}

export interface UserProvisioningContextDefaultsDto {
  roleScope: RoleScope;
  contextIds: string[];
}

export interface UserProvisioningSettingsValueDto extends UserProvisioningContextDefaultsDto {
  mode: UserProvisioningMode;
  defaultRole: ProjectRole;
}

export interface UserProvisioningSettingsDto {
  isApplicable: boolean;
  isMainProject: boolean;
  organization: UserProvisioningOrganizationDto | null;
  settings: UserProvisioningSettingsValueDto | null;
}

export class UpdateUserProvisioningSettingsCommand {
  constructor(
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly mode: UserProvisioningMode,
    public readonly defaultRole: ProjectRole,
    public readonly roleScope: RoleScope,
    public readonly contextIds: string[]
  ) {}
}
