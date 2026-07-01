import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApproveMembershipRequestResult,
  Payload,
  Project,
  ProjectMember,
  ProjectMemberInvitation,
  ProjectMembershipRequest,
  Role,
  UserProvisioningRequestAccessContext,
  RequestProjectAccessResult,
  CreateNewProjectResult,
  UserProvisioningSettings,
  UserProvisioningSettingsUpdate,
} from '@owox/idp-protocol';
import { In, Repository } from 'typeorm';
import { ProjectProjection } from '../entities/project-projection.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { IdpProviderService } from './idp-provider.service';
import { ProjectMemberDto } from '../dto/domain/project-member.dto';

/**
 * Service for updating projections in the database based on authorization payload.
 */
@Injectable()
export class IdpProjectionsService {
  private readonly logger = new Logger(IdpProjectionsService.name);

  constructor(
    @InjectRepository(ProjectProjection)
    private readonly projectsRepository: Repository<ProjectProjection>,
    @InjectRepository(UserProjection)
    private readonly usersRepository: Repository<UserProjection>,
    private readonly idpProviderService: IdpProviderService
  ) {}

  public async getProjectProjection(projectId: string): Promise<ProjectProjection | null> {
    return await this.projectsRepository.findOne({ where: { projectId } });
  }

  public async getUserProjection(userId: string): Promise<UserProjection | null> {
    return await this.usersRepository.findOne({ where: { userId } });
  }

  public async getUserProjectionList(userIds: string[]): Promise<UserProjection[]> {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    return await this.usersRepository.find({ where: { userId: In(userIds) } });
  }

  public async getAllUserProjections(): Promise<UserProjection[]> {
    return await this.usersRepository.find();
  }

  public async getProjectForUser(userId: string, projectId: string): Promise<Project> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.getProjectForUser(userId, projectId);
  }

  public async updateProjectionsFromIdpPayload(authorizationPayload: Payload): Promise<void> {
    await this.updateProjectProjection(authorizationPayload);
    await this.updateUserProjection(authorizationPayload);
  }

  private async updateProjectProjection(payload: Payload): Promise<void> {
    try {
      const { projectId, projectTitle } = payload;
      // Only update if the project title is known
      if (projectId && projectTitle) {
        await this.projectsRepository.upsert({ projectId, projectTitle, modifiedAt: new Date() }, [
          'projectId',
        ]);
      }
    } catch (error) {
      this.logger.error('Failed to update project projection', error);
    }
  }

  private async updateUserProjection(payload: Payload): Promise<void> {
    try {
      const { userId, fullName, email, avatar } = payload;
      // Only update if any user information is known
      if (userId && (fullName || email || avatar)) {
        await this.usersRepository.upsert(
          { userId, fullName, email, avatar, modifiedAt: new Date() },
          ['userId']
        );
      }
    } catch (error) {
      this.logger.error('Failed to update user projection', error);
    }
  }

  /**
   * Get project members from IDP provider and update projections.
   *
   * IDP failures are swallowed and an empty list is returned. This is
   * intentional for read-only / display paths (the legacy Members page,
   * notifications recipient picker, owners pickers) where graceful
   * degradation is preferable to a hard 500.
   *
   * **WRITE PATHS MUST NOT USE THIS METHOD.** A swallowed error here turns
   * into corrupted state when the caller filters or validates against the
   * returned list (e.g. `setContextMembers` would let admin user-ids slip
   * through the admin-strip filter, writing orphan rows). Use
   * `getProjectMembersOrThrow` for those paths.
   */
  public async getProjectMembers(projectId: string): Promise<ProjectMemberDto[]> {
    try {
      return await this.getProjectMembersOrThrow(projectId);
    } catch (error) {
      this.logger.error(`Failed to get project members for project ${projectId}`, error);
      return [];
    }
  }

  /**
   * Same as `getProjectMembers`, but propagates IDP failures to the caller.
   * Required by write paths that filter/validate against the returned list,
   * because a silently-empty list would let admin user-ids past the
   * admin-strip filter or let unknown user-ids be written as bindings.
   */
  public async getProjectMembersOrThrow(projectId: string): Promise<ProjectMemberDto[]> {
    const provider = this.idpProviderService.getProviderFromApp();
    const members = await provider.getProjectMembers(projectId);

    await this.updateUserProjections(members);

    return members
      .filter(m => m.userStatus !== 'locked' && m.userStatus !== 'erased')
      .map(
        m =>
          new ProjectMemberDto(
            m.userId,
            m.email,
            m.fullName,
            m.avatar,
            m.projectRole,
            m.hasNotificationsEnabled,
            m.isOutbound ?? false
          )
      );
  }

  /**
   * Invite a new member to the project via the active IDP provider.
   * Errors propagate to the caller — the HTTP controller is responsible for
   * surfacing them as the correct status code.
   */
  public async inviteMember(
    projectId: string,
    email: string,
    role: Role,
    actorUserId: string
  ): Promise<ProjectMemberInvitation> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.inviteMember(projectId, email, role, actorUserId);
  }

  /**
   * Remove a member from the project via the active IDP provider.
   */
  public async removeMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    const provider = this.idpProviderService.getProviderFromApp();
    await provider.removeMember(projectId, userId, actorUserId);
  }

  /**
   * Change a member's role via the active IDP provider.
   */
  public async changeMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    actorUserId: string
  ): Promise<void> {
    const provider = this.idpProviderService.getProviderFromApp();
    await provider.changeMemberRole(projectId, userId, newRole, actorUserId);
  }

  public async listMembershipRequests(
    projectId: string,
    actorUserId: string
  ): Promise<ProjectMembershipRequest[]> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.listMembershipRequests(projectId, actorUserId);
  }

  public async approveMembershipRequest(
    projectId: string,
    requestId: string,
    role: Role,
    actorUserId: string
  ): Promise<ApproveMembershipRequestResult> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.approveMembershipRequest(projectId, requestId, role, actorUserId);
  }

  public async declineMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void> {
    const provider = this.idpProviderService.getProviderFromApp();
    await provider.declineMembershipRequest(projectId, requestId, actorUserId);
  }

  public async getUserProvisioningSettings(
    projectId: string,
    actorUserId: string
  ): Promise<UserProvisioningSettings> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.getUserProvisioningSettings(projectId, actorUserId);
  }

  public async updateUserProvisioningSettings(
    projectId: string,
    actorUserId: string,
    settings: UserProvisioningSettingsUpdate
  ): Promise<UserProvisioningSettings> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.updateUserProvisioningSettings(projectId, actorUserId, settings);
  }

  public async getUserProvisioningRequestAccessContext(
    userId: string,
    projectId: string
  ): Promise<UserProvisioningRequestAccessContext> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.getUserProvisioningRequestAccessContext(userId, projectId);
  }

  public async requestProjectAccess(
    userId: string,
    projectId: string,
    role: Role
  ): Promise<RequestProjectAccessResult> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.requestProjectAccess(userId, projectId, role);
  }

  public async createNewProject(
    userId: string,
    integration: string
  ): Promise<CreateNewProjectResult> {
    const provider = this.idpProviderService.getProviderFromApp();
    return provider.createNewProject(userId, integration);
  }

  /**
   * Update or insert user projections for multiple members
   */
  private async updateUserProjections(members: ProjectMember[]): Promise<void> {
    if (members.length === 0) return;
    try {
      const now = new Date();
      const sorted = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
      await this.usersRepository.upsert(
        sorted.map(member => ({
          userId: member.userId,
          email: member.email,
          fullName: member.fullName,
          avatar: member.avatar,
          modifiedAt: now,
        })),
        ['userId']
      );
    } catch (error) {
      this.logger.error('Failed to update user projections', error);
    }
  }
}
