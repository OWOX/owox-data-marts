import { getRoleDisplayName, type Role } from '@owox/idp-protocol';
import type { EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import {
  ActionEmailSender,
  type ActionEmailContent,
  type ActionEmailSendOptions,
} from './action-email-sender.js';
import { formatProjectTitle } from './format-project-title.js';

/**
 * The invite request waits for this email after the access check (up to 3 s) and the invite
 * itself (up to 10 s), and the backend answers 408 after 30 s. So one send keeps the
 * `ActionEmailSender` defaults: 12 s in total, attempts of up to 5 s.
 */
export type ProjectInvitationEmailOptions = ActionEmailSendOptions;

export interface ProjectInvitationEmailPayload {
  /** Email of the invited person. */
  email: string;
  role: Role;
  projectId: string;
  projectTitle?: string;
  inviterEmail?: string;
}

/**
 * Renders and sends the email that tells a person they were invited to a project.
 */
export class ProjectInvitationEmailService {
  private readonly sender: ActionEmailSender;
  private readonly appBaseUrl: string;

  /**
   * @param appBaseUrl public origin of the app; the email links to the project there.
   */
  constructor(
    emailProvider: EmailProvider,
    appBaseUrl: string,
    options: ProjectInvitationEmailOptions = {}
  ) {
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, '');
    this.sender = new ActionEmailSender(emailProvider, options);
  }

  /**
   * Sends the invitation, retrying failed attempts. Throws the last error when all attempts fail.
   */
  async send(payload: ProjectInvitationEmailPayload): Promise<void> {
    await this.sender.send({
      to: payload.email,
      content: this.buildContent(payload),
      categories: ['transactional', 'project-invitation'],
      logContext: { projectId: payload.projectId },
    });
  }

  /**
   * The wording follows the invitation email users received before OWOX Data Marts
   * sent it itself. The invited person's first name is not known reliably, so the
   * greeting uses its fallback.
   */
  private buildContent(payload: ProjectInvitationEmailPayload): ActionEmailContent {
    const projectTitle = payload.projectTitle ? formatProjectTitle(payload.projectTitle) : '';
    const roleName = getRoleDisplayName(payload.role);
    const byInviter = payload.inviterEmail ? ` by user ${payload.inviterEmail}` : '';
    const description = `You have been invited${byInviter} to join ${
      projectTitle || 'the OWOX project'
    } as a ${roleName}.`;
    // Escaped the same way the template escapes `<%= %>` output.
    const descriptionHtml = `You have been invited${ejs.escapeXML(byInviter)} to join ${
      projectTitle ? `<strong>${ejs.escapeXML(projectTitle)}</strong>` : 'the OWOX project'
    } as a <strong>${ejs.escapeXML(roleName)}</strong>.`;

    return {
      subject: projectTitle
        ? `You're invited to ${projectTitle} in OWOX Data Marts`
        : "You're invited to a project in OWOX Data Marts",
      title: 'Hey friend',
      preheader: projectTitle ? `Project ${projectTitle}` : description,
      description,
      descriptionHtml,
      buttonText: 'Accept invitation',
      actionUrl: `${this.appBaseUrl}/ui/${encodeURIComponent(payload.projectId)}/data-marts`,
      footer: "If you weren't expecting this invitation, you can ignore this email.",
    };
  }
}
