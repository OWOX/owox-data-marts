import type {
  ApproveMembershipRequestResult,
  ProjectMembershipRequest,
  Role,
} from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/IdentityOwoxClient.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { maskEmail } from '../../utils/email-utils.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';
import { findLocalUserEmail } from './user-email-lookup.js';

/**
 * MembershipRequestsService — thin wrapper over `IdentityOwoxClient` that
 * adapts the Java `MembershipRequestDto` / approve / decline endpoints into
 * the shared `IdpProvider` contract. An approval also emails the person who asked.
 */
export class MembershipRequestsService {
  private readonly logger = createServiceLogger(MembershipRequestsService.name);

  constructor(
    private readonly identityClient: IdentityOwoxClient,
    private readonly store: DatabaseStore,
    private readonly emailService: AccessRequestEmailService
  ) {}

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

  /**
   * The response does not wait for the approval email, and a failed email does not fail
   * the approval.
   */
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
    void this.notifyRequester(projectId, userUid, role);
    return { userId: userUid };
  }

  /**
   * Emails the approved person. Never throws. The email is mandatory, so it ignores
   * notification settings.
   */
  async notifyRequester(projectId: string, userId: string, role: Role): Promise<void> {
    let requesterEmail: string | undefined;
    try {
      requesterEmail = await this.findUserEmail(projectId, userId);
      if (!requesterEmail) {
        this.logger.warn('No email for the approved access request', { projectId, userId });
        return;
      }
      await this.emailService.sendApprovalToRequester({ requesterEmail, role, projectId });
    } catch (error) {
      this.logger.error(
        'Failed to send access approval email',
        { projectId, ...(requesterEmail ? { email: maskEmail(requesterEmail) } : {}) },
        error
      );
    }
  }

  /**
   * The local user record first; the project members from Identity, where the
   * approved person now is, when there is no local record.
   */
  private async findUserEmail(projectId: string, userId: string): Promise<string | undefined> {
    const localEmail = await findLocalUserEmail(this.store, userId, this.logger, { projectId });
    if (localEmail) {
      return localEmail;
    }
    const { projectMembers } = await this.identityClient.getProjectMembers(projectId);
    return projectMembers.find(member => String(member.userId) === userId)?.email || undefined;
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
