import type {
  ApproveMembershipRequestResult,
  ProjectMembershipRequest,
  Role,
} from '@owox/idp-protocol';
import { withTimeout } from '@owox/internal-helpers';
import type { IdentityOwoxClient } from '../../client/IdentityOwoxClient.js';
import { DEFAULT_APPROVAL_TITLE_LOOKUP_TIMEOUT_MS } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { maskEmail } from '../../utils/email-utils.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';
import { findLocalUserEmail } from './user-email-lookup.js';

export interface MembershipRequestsServiceOptions {
  /** How long the approval email waits for the project title before it goes without it. */
  titleLookupTimeoutMs?: number;
}

/**
 * MembershipRequestsService adapts the Java `MembershipRequestDto` / approve / decline
 * endpoints of `IdentityOwoxClient` into the shared `IdpProvider` contract,
 * and emails the person who asked when an admin approves their request.
 */
export class MembershipRequestsService {
  private readonly logger = createServiceLogger(MembershipRequestsService.name);
  private readonly titleLookupTimeoutMs: number;

  constructor(
    private readonly identityClient: IdentityOwoxClient,
    private readonly store: DatabaseStore,
    /** Absent while project emails are switched off; the legacy mailer sends them then. */
    private readonly emailService: AccessRequestEmailService | undefined,
    options: MembershipRequestsServiceOptions = {}
  ) {
    this.titleLookupTimeoutMs =
      options.titleLookupTimeoutMs ?? DEFAULT_APPROVAL_TITLE_LOOKUP_TIMEOUT_MS;
  }

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
    void this.notifyRequester(projectId, userUid, role, actorUserId);
    return { userId: userUid };
  }

  /**
   * Emails the approved person. Never throws. The email is mandatory, so it ignores
   * notification settings. Does nothing while project emails are switched off.
   *
   * @param actorUserId the admin who approved; the project title is read on their behalf.
   */
  async notifyRequester(
    projectId: string,
    userId: string,
    role: Role,
    actorUserId: string
  ): Promise<void> {
    const emailService = this.emailService;
    if (!emailService) {
      return;
    }
    let requesterEmail: string | undefined;
    try {
      const [email, projectTitle] = await Promise.all([
        this.findUserEmail(projectId, userId),
        this.findProjectTitle(projectId, actorUserId),
      ]);
      requesterEmail = email;
      if (!requesterEmail) {
        this.logger.warn('No email for the approved access request', { projectId, userId });
        return;
      }
      await emailService.sendApprovalToRequester({ requesterEmail, role, projectId, projectTitle });
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

  /** The title only names the project in the email, so a slow or failed lookup leaves it out. */
  private async findProjectTitle(
    projectId: string,
    actorUserId: string
  ): Promise<string | undefined> {
    const title = Promise.resolve()
      .then(() => this.identityClient.getProjectForUser(actorUserId, projectId))
      .then(project => project.title || undefined)
      .catch((error: unknown) => {
        this.logger.warn(
          'Could not load project title for access approval email',
          { projectId },
          error
        );
        return undefined;
      });
    return withTimeout(title, this.titleLookupTimeoutMs, undefined);
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
