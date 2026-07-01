import { Injectable } from '@nestjs/common';
import type { Role as IdpRole } from '@owox/idp-protocol';
import {
  MembershipRequestApiDto,
  ProjectMemberResponseApiDto,
} from '../dto/presentation/context-api.dto';
import { ProjectRole } from '../enums/project-role.enum';
import type { ProjectMembershipRequestDto } from '../use-cases/project-members/dto/project-membership-request.dto';
import { UpdateUserProvisioningSettingsCommand } from '../dto/domain/user-provisioning-settings.dto';
import {
  UpdateUserProvisioningSettingsRequestApiDto,
  UserProvisioningSettingsResponseApiDto,
} from '../dto/presentation/user-provisioning-settings-api.dto';
import type { ProjectMemberWithScope } from '../use-cases/project-members/list-project-members.service';
import type { UserProvisioningSettingsDto } from '../dto/domain/user-provisioning-settings.dto';

@Injectable()
export class ProjectMembersMapper {
  toApiResponse(member: ProjectMemberWithScope): ProjectMemberResponseApiDto {
    return {
      userId: member.userId,
      email: member.email,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      role: member.role,
      roleScope: member.roleScope,
      contextIds: member.contextIds,
    };
  }

  toApiResponseList(members: ProjectMemberWithScope[]): ProjectMemberResponseApiDto[] {
    return members.map(m => this.toApiResponse(m));
  }

  toMembershipRequestApi(request: ProjectMembershipRequestDto): MembershipRequestApiDto {
    return {
      requestId: request.requestId,
      email: request.email,
      fullName: request.fullName,
      avatar: request.avatar,
      userId: request.userId,
      requestedRole: request.requestedRole,
      createdAt: request.createdAt,
    };
  }

  toMembershipRequestApiList(requests: ProjectMembershipRequestDto[]): MembershipRequestApiDto[] {
    return requests.map(r => this.toMembershipRequestApi(r));
  }

  toUserProvisioningSettingsApiResponse(
    settings: UserProvisioningSettingsDto
  ): UserProvisioningSettingsResponseApiDto {
    return settings;
  }

  toUpdateUserProvisioningSettingsCommand(
    projectId: string,
    actorUserId: string,
    dto: UpdateUserProvisioningSettingsRequestApiDto
  ): UpdateUserProvisioningSettingsCommand {
    return new UpdateUserProvisioningSettingsCommand(
      projectId,
      actorUserId,
      dto.mode,
      dto.defaultRole,
      dto.roleScope,
      dto.contextIds
    );
  }
}

/**
 * `ProjectRole` (BI's domain enum) and `IdpRole` (`@owox/idp-protocol` Zod-derived
 * `Role`) share values today but are nominally distinct types. A bare `as IdpRole`
 * cast disappears the moment BI gains a role IDP does not support, landing as a
 * 400 at the wire boundary. This helper makes the boundary explicit and throws
 * before reaching the IDP if a new BI role ever appears without an IDP mapping.
 */
const PROJECT_TO_IDP_ROLE: Record<ProjectRole, IdpRole> = {
  [ProjectRole.ADMIN]: 'admin',
  [ProjectRole.EDITOR]: 'editor',
  [ProjectRole.VIEWER]: 'viewer',
};

export function toIdpRole(role: ProjectRole): IdpRole {
  const mapped = PROJECT_TO_IDP_ROLE[role];
  if (!mapped) {
    throw new Error(`No IDP role mapping for project role "${String(role)}"`);
  }
  return mapped;
}

/**
 * Reverse mapping for the read direction (IDP → BI). The IDP-package Zod
 * schema constrains `IdpRole` to the same three values BI knows, so this is
 * a total mapping — but spelling it out explicitly (instead of `as ProjectRole`)
 * means an IDP-side enum drift would land here as `undefined` rather than
 * leak a foreign string into the domain layer.
 */
const IDP_TO_PROJECT_ROLE: Record<IdpRole, ProjectRole> = {
  admin: ProjectRole.ADMIN,
  editor: ProjectRole.EDITOR,
  viewer: ProjectRole.VIEWER,
};

export function toProjectRole(role: IdpRole): ProjectRole {
  const mapped = IDP_TO_PROJECT_ROLE[role];
  if (!mapped) {
    throw new Error(`No project role mapping for IDP role "${String(role)}"`);
  }
  return mapped;
}
