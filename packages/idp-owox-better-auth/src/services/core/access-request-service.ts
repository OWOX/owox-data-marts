import type { RequestProjectAccessResult, Role } from '@owox/idp-protocol';
import { withTimeout } from '@owox/internal-helpers';
import type { IdentityOwoxClient } from '../../client/index.js';
import type { OwoxRequestProjectAccessResponse } from '../../client/dto/index.js';
import { DEFAULT_PENDING_REQUEST_CHECK_TIMEOUT_MS } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { maskEmail, normalizeEmail } from '../../utils/email-utils.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';
import { findLocalUserEmail } from './user-email-lookup.js';

export interface AccessRequestServiceOptions {
  /** How long to wait for the pending-request check before treating the request as new. */
  pendingRequestCheckTimeoutMs?: number;
}

export interface AccessRequestNotification {
  projectId: string;
  requesterUserId: string;
  /** Requester email known from Identity; used when the local user record has none. */
  requesterEmail?: string;
  role: Role;
}

interface AccessRequestState {
  role: Role;
  status: string;
}

interface PendingRequestCheck {
  /** The user's request Identity reported before this call, if any. */
  existingRequest?: AccessRequestState | null;
  requesterEmail?: string;
}

/**
 * Creates access requests in Identity and emails the project admins about new ones.
 */
export class AccessRequestService {
  private readonly logger = createServiceLogger(AccessRequestService.name);
  private readonly pendingRequestCheckTimeoutMs: number;

  constructor(
    private readonly store: DatabaseStore,
    private readonly identityClient: IdentityOwoxClient,
    /** Absent while project emails are switched off; the legacy mailer sends them then. */
    private readonly emailService: AccessRequestEmailService | undefined,
    options: AccessRequestServiceOptions = {}
  ) {
    this.pendingRequestCheckTimeoutMs =
      options.pendingRequestCheckTimeoutMs ?? DEFAULT_PENDING_REQUEST_CHECK_TIMEOUT_MS;
  }

  /**
   * Identity answers a repeated request with the request that is already pending,
   * the same way it answers a new one. The admins are not emailed again when the
   * request Identity reported before this call has the same status and role as the
   * one it returns now. A request after a declined one, or for another role, is news.
   *
   * The response does not wait for the emails, and a failed email does not fail the request.
   * While project emails are switched off, this is only the Identity call.
   */
  async requestAccess(
    userId: string,
    projectId: string,
    role: Role
  ): Promise<RequestProjectAccessResult> {
    if (!this.emailService) {
      return toResult(await this.identityClient.requestProjectAccess(userId, projectId, role));
    }

    const check = await this.checkPendingRequest(userId, projectId);
    const result = toResult(
      await this.identityClient.requestProjectAccess(userId, projectId, role)
    );

    if (isSameRequest(check.existingRequest, result.request)) {
      this.logger.info('Access request was already pending, admins are not emailed again', {
        projectId,
      });
    } else {
      void this.notifyAdmins({
        projectId: result.projectId,
        requesterUserId: userId,
        requesterEmail: check.requesterEmail,
        role: result.request.role,
      });
    }

    return result;
  }

  /**
   * Emails every active admin of the project. Never throws.
   * The email is mandatory, so admins who turned off notifications get it too.
   * Does nothing while project emails are switched off.
   */
  async notifyAdmins(notification: AccessRequestNotification): Promise<void> {
    const emailService = this.emailService;
    if (!emailService) {
      return;
    }
    const { projectId } = notification;
    try {
      const [adminEmails, requesterEmail] = await Promise.all([
        this.findAdminEmails(projectId),
        this.findRequesterEmail(notification),
      ]);

      if (adminEmails.length === 0) {
        this.logger.warn('Project has no admins to email about the access request', { projectId });
        return;
      }

      const results = await Promise.allSettled(
        adminEmails.map(adminEmail =>
          emailService.sendRequestToAdmin({
            adminEmail,
            requesterEmail,
            role: notification.role,
            projectId,
          })
        )
      );

      let failed = 0;
      results.forEach((outcome, index) => {
        if (outcome.status === 'rejected') {
          failed++;
          this.logger.error(
            'Failed to send access request email',
            { projectId, email: maskEmail(adminEmails[index] ?? '') },
            outcome.reason
          );
        }
      });
      this.logger.info('Access request emails sent', {
        projectId,
        sent: adminEmails.length - failed,
        failed,
      });
    } catch (error) {
      this.logger.error(
        'Could not email project admins about the access request',
        { projectId },
        error
      );
    }
  }

  /**
   * The current admins from Identity, not the local members cache,
   * so people who left the project are not emailed.
   */
  private async findAdminEmails(projectId: string): Promise<string[]> {
    const response = await this.identityClient.getProjectMembers(projectId);
    const emails = new Map<string, string>();
    for (const member of response.projectMembers) {
      const email = member.email.trim();
      const key = normalizeEmail(email);
      if (
        member.projectRole === 'admin' &&
        member.userStatus === 'active' &&
        email &&
        !emails.has(key)
      ) {
        emails.set(key, email);
      }
    }
    return [...emails.values()];
  }

  private async findRequesterEmail(
    notification: AccessRequestNotification
  ): Promise<string | undefined> {
    const localEmail = await findLocalUserEmail(
      this.store,
      notification.requesterUserId,
      this.logger,
      { projectId: notification.projectId }
    );
    return localEmail ?? (notification.requesterEmail || undefined);
  }

  /**
   * When the check fails or is slow, the request is treated as new, so the admins
   * may get a second email rather than none.
   */
  private async checkPendingRequest(
    userId: string,
    projectId: string
  ): Promise<PendingRequestCheck> {
    const check = this.identityClient
      .getUserProvisioningRequestAccessContext(userId, projectId)
      .then(
        (context): PendingRequestCheck => ({
          existingRequest: context.existingRequest,
          requesterEmail: context.user.email,
        }),
        (error: unknown): PendingRequestCheck => {
          this.logger.warn('Could not check for a pending access request', { projectId }, error);
          return {};
        }
      );
    return withTimeout(check, this.pendingRequestCheckTimeoutMs, {});
  }
}

function toResult(response: OwoxRequestProjectAccessResponse): RequestProjectAccessResult {
  return {
    userId: response.user.userUid,
    projectId: response.project.projectName,
    projectTitle: response.project.projectTitle,
    request: response.request,
  };
}

function isSameRequest(
  before: AccessRequestState | null | undefined,
  now: AccessRequestState
): boolean {
  return Boolean(before && before.status === now.status && before.role === now.role);
}
