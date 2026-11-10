import type { RequestProjectAccessResult, Role } from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/index.js';
import { DEFAULT_PENDING_REQUEST_CHECK_TIMEOUT_MS } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { maskEmail } from '../../utils/email-utils.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';

export interface AccessRequestServiceOptions {
  /** How long to wait for the pending-request check before treating the request as new. */
  pendingRequestCheckTimeoutMs?: number;
}

export interface AccessRequestNotification {
  projectId: string;
  projectTitle?: string;
  requesterUserId: string;
  /** Requester email known from Identity; used when the local user record has none. */
  requesterEmail?: string;
  role: Role;
}

interface PendingRequestCheck {
  pending: boolean;
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
    private readonly emailService: AccessRequestEmailService,
    options: AccessRequestServiceOptions = {}
  ) {
    this.pendingRequestCheckTimeoutMs =
      options.pendingRequestCheckTimeoutMs ?? DEFAULT_PENDING_REQUEST_CHECK_TIMEOUT_MS;
  }

  /**
   * Identity answers a repeated request with the request that is already pending,
   * the same way it answers a new one. The admins are emailed only when no request
   * was pending before, so repeating the request does not email them again.
   *
   * The response does not wait for the emails, and a failed email does not fail the request.
   */
  async requestAccess(
    userId: string,
    projectId: string,
    role: Role
  ): Promise<RequestProjectAccessResult> {
    const check = await this.checkPendingRequest(userId, projectId);
    const response = await this.identityClient.requestProjectAccess(userId, projectId, role);
    const result: RequestProjectAccessResult = {
      userId: response.user.userUid,
      projectId: response.project.projectName,
      projectTitle: response.project.projectTitle,
      request: response.request,
    };

    if (check.pending) {
      this.logger.info('Access request was already pending, admins are not emailed again', {
        projectId,
      });
    } else {
      void this.notifyAdmins({
        projectId: result.projectId,
        projectTitle: result.projectTitle,
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
   */
  async notifyAdmins(notification: AccessRequestNotification): Promise<void> {
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
          this.emailService.send({
            adminEmail,
            requesterEmail,
            role: notification.role,
            projectId,
            projectTitle: notification.projectTitle,
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
      const key = email.toLowerCase();
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
    try {
      const user = await this.store.getUserByBiUserId(notification.requesterUserId);
      if (user?.email) {
        return user.email;
      }
    } catch (error) {
      this.logger.warn(
        'Could not load requester email for access request email',
        { projectId: notification.projectId },
        error
      );
    }
    return notification.requesterEmail || undefined;
  }

  /**
   * When the check fails or is slow, the request is treated as new, so the admins
   * may get a second email rather than none.
   */
  private async checkPendingRequest(
    userId: string,
    projectId: string
  ): Promise<PendingRequestCheck> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<PendingRequestCheck>(resolve => {
      timer = setTimeout(() => resolve({ pending: false }), this.pendingRequestCheckTimeoutMs);
    });
    const check = this.identityClient
      .getUserProvisioningRequestAccessContext(userId, projectId)
      .then(
        (context): PendingRequestCheck => ({
          pending: Boolean(context.existingRequest),
          requesterEmail: context.user.email,
        }),
        (error: unknown): PendingRequestCheck => {
          this.logger.warn('Could not check for a pending access request', { projectId }, error);
          return { pending: false };
        }
      );
    try {
      return await Promise.race([check, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
