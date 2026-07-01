import type {
  ApproveMembershipRequestResult,
  ProjectMembershipRequest,
  Role,
} from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/IdentityOwoxClient.js';
import { createServiceLogger } from '../../core/logger.js';

/**
 * MembershipRequestsService — thin wrapper over `IdentityOwoxClient` that
 * adapts the Java `MembershipRequestDto` / approve / decline endpoints into
 * the shared `IdpProvider` contract.
 */
export class MembershipRequestsService {
  private readonly logger = createServiceLogger(MembershipRequestsService.name);

  constructor(private readonly identityClient: IdentityOwoxClient) {}

  async listMembershipRequests(
    projectId: string,
    actorUserId: string
  ): Promise<ProjectMembershipRequest[]> {
    this.logger.debug('listMembershipRequests', { projectId, actorUserId });
    const data = await this.identityClient.listProjectMembershipRequests(projectId, actorUserId);
    return data.map(item => ({
      requestId: item.requestId,
      email: item.email,
      fullName: item.fullName,
      avatar: item.avatar ?? undefined,
      userId: item.userId,
      requestedRole: item.requestedRole,
      createdAt: item.createdAt,
    }));
  }

  async approveMembershipRequest(
    projectId: string,
    requestId: string,
    role: Role,
    actorUserId: string
  ): Promise<ApproveMembershipRequestResult> {
    this.logger.debug('approveMembershipRequest', {
      projectId,
      requestId,
      role,
      actorUserId,
    });
    const { userUid } = await this.identityClient.approveProjectMembershipRequest(
      projectId,
      requestId,
      role,
      actorUserId
    );
    return { userId: userUid };
  }

  async declineMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void> {
    this.logger.debug('declineMembershipRequest', {
      projectId,
      requestId,
      actorUserId,
    });
    await this.identityClient.declineProjectMembershipRequest(projectId, requestId, actorUserId);
  }
}
