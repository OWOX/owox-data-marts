import { getRoleDisplayName, type Role } from '@owox/idp-protocol';
import type { EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import {
  ActionEmailSender,
  formatProjectTitle,
  type ActionEmailContent,
  type ActionEmailSendOptions,
} from './action-email-sender.js';

export interface AccessRequestEmailPayload {
  /** Email of the project admin who receives the request. */
  adminEmail: string;
  /** Email of the person asking for access, when known. */
  requesterEmail?: string;
  /** Role the person asked for. */
  role: Role;
  projectId: string;
  projectTitle?: string;
}

/**
 * Renders and sends the email that tells a project admin someone asked to join the project.
 */
export class AccessRequestEmailService {
  private readonly sender: ActionEmailSender;
  private readonly appBaseUrl: string;

  /**
   * @param appBaseUrl public origin of the app; the email links to the project members there.
   */
  constructor(
    emailProvider: EmailProvider,
    appBaseUrl: string,
    options: ActionEmailSendOptions = {}
  ) {
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, '');
    this.sender = new ActionEmailSender(emailProvider, options);
  }

  /**
   * Sends the email to one admin, retrying failed attempts. Throws the last error when all attempts fail.
   */
  async send(payload: AccessRequestEmailPayload): Promise<void> {
    await this.sender.send({
      to: payload.adminEmail,
      content: this.buildContent(payload),
      categories: ['transactional', 'project-access-request'],
      logContext: { projectId: payload.projectId },
    });
  }

  // TODO: replace the wording with the approved copy of the access request email.
  private buildContent(payload: AccessRequestEmailPayload): ActionEmailContent {
    const projectTitle = payload.projectTitle ? formatProjectTitle(payload.projectTitle) : '';
    const roleName = getRoleDisplayName(payload.role);
    const requester = payload.requesterEmail ? `User ${payload.requesterEmail}` : 'Someone';
    const description = `${requester} requested access to ${
      projectTitle || 'your OWOX project'
    } as a ${roleName}.`;
    // Escaped the same way the template escapes `<%= %>` output.
    const descriptionHtml = `${ejs.escapeXML(requester)} requested access to ${
      projectTitle ? `<strong>${ejs.escapeXML(projectTitle)}</strong>` : 'your OWOX project'
    } as a <strong>${ejs.escapeXML(roleName)}</strong>.`;

    return {
      subject: projectTitle
        ? `Access request to ${projectTitle} in OWOX Data Marts`
        : 'Access request to your project in OWOX Data Marts',
      title: 'New access request',
      preheader: projectTitle ? `Project ${projectTitle}` : description,
      description,
      descriptionHtml,
      buttonText: 'Review request',
      actionUrl: `${this.appBaseUrl}/ui/${encodeURIComponent(payload.projectId)}/project-settings/members`,
      footer: 'You received this email because you are an admin of this project.',
    };
  }
}
