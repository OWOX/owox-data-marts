import { Injectable } from '@nestjs/common';
import type {
  ApproveMembershipRequestResult,
  ProjectMemberInvitation,
  ProjectMembershipRequest,
  Role,
} from '@owox/idp-protocol';
import { ProjectProjectionDto } from '../dto/domain/project-projection.dto';
import { UserProjectionDto } from '../dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../dto/domain/user-projections-list.dto';
import { ProjectionsMapper } from '../mappers/projections.mapper';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { ProjectMemberDto } from '../dto/domain/project-member.dto';

/**
 * A facade service that provides methods to retrieve projections
 * for projects and users using the underlying IdpProjectionsService and ProjectionsMapper.
 */
@Injectable()
export class IdpProjectionsFacade {
  constructor(
    private readonly idpProjectionsService: IdpProjectionsService,
    private readonly mapper: ProjectionsMapper
  ) {}

  public async getProjectProjection(projectId: string): Promise<ProjectProjectionDto | undefined> {
    const projection = await this.idpProjectionsService.getProjectProjection(projectId);
    if (projection) {
      return this.mapper.toProjectProjectionDto(projection);
    }
  }

  public async getUserProjection(userId: string): Promise<UserProjectionDto | undefined> {
    const projection = await this.idpProjectionsService.getUserProjection(userId);
    if (projection) {
      return this.mapper.toUserProjectionDto(projection);
    }
  }

  public async getUserProjectionList(userIds: string[]): Promise<UserProjectionsListDto> {
    const projections = await this.idpProjectionsService.getUserProjectionList(userIds);
    return this.mapper.toUserProjectionDtoList(projections);
  }

  public async getProjectMembers(projectId: string): Promise<ProjectMemberDto[]> {
    return this.idpProjectionsService.getProjectMembers(projectId);
  }

  /**
   * Strict variant of `getProjectMembers` — propagates IDP failures instead
   * of degrading to `[]`. Use on write paths that filter or validate
   * against the returned list (e.g. setContextMembers admin-strip /
   * membership check), where a silently-empty list would corrupt state.
   */
  public async getProjectMembersOrThrow(projectId: string): Promise<ProjectMemberDto[]> {
    return this.idpProjectionsService.getProjectMembersOrThrow(projectId);
  }

  /**
   * Resolve a single project member by userId. The active IDP provider only
   * exposes a list endpoint, so this is a thin wrapper — callers should use
   * it instead of `getProjectMembers(...).find(...)` so the linear-scan
   * pattern lives in one place and a future bulk-cache or per-id API surfaces
   * here.
   */
  public async getProjectMember(
    projectId: string,
    userId: string
  ): Promise<ProjectMemberDto | undefined> {
    const members = await this.getProjectMembers(projectId);
    return members.find(m => m.userId === userId);
  }

  /**
   * Strict variant of `getProjectMember` — propagates IDP failures instead
   * of silently treating them as "user removed". Use on run-accessor paths
   * where a transient IDP outage must not get persisted as a membership-loss
   * business violation.
   */
  public async getProjectMemberOrThrow(
    projectId: string,
    userId: string
  ): Promise<ProjectMemberDto | undefined> {
    const members = await this.getProjectMembersOrThrow(projectId);
    return members.find(m => m.userId === userId);
  }

  /**
   * Invite a member via the active IDP provider.
   *
   * NOTE: per `project_idp_invite_semantics`, providers return distinct
   * shapes through the `ProjectMemberInvitation` discriminated union
   * (`kind: 'magic-link' | 'email-sent'`). The facade intentionally does
   * NOT collapse them — the controller maps the variant directly into
   * `InviteMemberResponseApiDto` so the UI can render the magic-link copy
   * box vs. the email-sent toast on the right path.
   */
  public async inviteMember(
    projectId: string,
    email: string,
    role: Role,
    actorUserId: string
  ): Promise<ProjectMemberInvitation> {
    return this.idpProjectionsService.inviteMember(projectId, email, role, actorUserId);
  }

  public async removeMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    return this.idpProjectionsService.removeMember(projectId, userId, actorUserId);
  }

  public async changeMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    actorUserId: string
  ): Promise<void> {
    return this.idpProjectionsService.changeMemberRole(projectId, userId, newRole, actorUserId);
  }

  public async listMembershipRequests(
    projectId: string,
    actorUserId: string
  ): Promise<ProjectMembershipRequest[]> {
    return this.idpProjectionsService.listMembershipRequests(projectId, actorUserId);
  }

  public async approveMembershipRequest(
    projectId: string,
    requestId: string,
    role: Role,
    actorUserId: string
  ): Promise<ApproveMembershipRequestResult> {
    return this.idpProjectionsService.approveMembershipRequest(
      projectId,
      requestId,
      role,
      actorUserId
    );
  }

  public async declineMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void> {
    await this.idpProjectionsService.declineMembershipRequest(projectId, requestId, actorUserId);
  }
}
