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
 * Nothing waits for these emails, so an attempt gets 15 s instead of 5 s, and the budget fits
 * all three attempts with their pauses. An attempt aborted on time can still be delivered,
 * and its retry would send a second email.
 */
const ATTEMPT_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 50_000;

export interface AccessRequestEmailPayload {
  /** Email of the project admin who receives the request. */
  adminEmail: string;
  /** Email of the person asking for access, when known. */
  requesterEmail?: string;
  /** Role the person asked for. */
  role: Role;
  projectId: string;
  /** Project title, when known. Without it the email says "your project". */
  projectTitle?: string;
}

export interface AccessApprovalEmailPayload {
  /** Email of the person whose request was approved. */
  requesterEmail: string;
  /** Role the admin granted. */
  role: Role;
  projectId: string;
  /** Project title, when known. Without it the email says "the OWOX project". */
  projectTitle?: string;
}

/**
 * Renders and sends the two access request emails: the request to each project admin,
 * and the approval to the person who asked.
 *
 * The wording follows the emails users received before OWOX Data Marts sent them itself,
 * and names the project the way the invitation email does.
 * The recipient's first name is not known reliably, so the greeting uses its fallback.
 */
export class AccessRequestEmailService {
  private readonly sender: ActionEmailSender;
  private readonly appBaseUrl: string;

  /**
   * @param appBaseUrl public origin of the app; the emails link to the project there.
   */
  constructor(
    emailProvider: EmailProvider,
    appBaseUrl: string,
    options: ActionEmailSendOptions = {}
  ) {
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, '');
    this.sender = new ActionEmailSender(emailProvider, {
      ...options,
      attemptTimeoutMs: options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS,
      totalTimeoutMs: options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS,
    });
  }

  /**
   * Tells one admin that someone asked to join the project.
   * Throws the last error when all attempts fail.
   */
  async sendRequestToAdmin(payload: AccessRequestEmailPayload): Promise<void> {
    await this.sender.send({
      to: payload.adminEmail,
      content: this.buildRequestContent(payload),
      categories: ['transactional', 'project-access-request'],
      logContext: { projectId: payload.projectId },
    });
  }

  /**
   * Tells the person who asked that their request was approved.
   * Throws the last error when all attempts fail.
   */
  async sendApprovalToRequester(payload: AccessApprovalEmailPayload): Promise<void> {
    await this.sender.send({
      to: payload.requesterEmail,
      content: this.buildApprovalContent(payload),
      categories: ['transactional', 'project-access-approved'],
      logContext: { projectId: payload.projectId },
    });
  }

  private buildRequestContent(payload: AccessRequestEmailPayload): ActionEmailContent {
    const roleName = getRoleDisplayName(payload.role);
    const membersUrl = this.projectUrl(payload.projectId, 'project-settings/members');
    const requester = payload.requesterEmail
      ? `The user with the email ${payload.requesterEmail}`
      : 'A user';
    const projectTitle = payload.projectTitle ? formatProjectTitle(payload.projectTitle) : '';
    const description = `${requester} has requested a change in permissions for ${
      projectTitle || 'your project'
    } to the role of ${roleName}.`;
    // Escaped the same way the template escapes `<%= %>` output.
    const descriptionHtml = `${ejs.escapeXML(requester)} has requested a change in permissions for ${
      projectTitle ? `<strong>${ejs.escapeXML(projectTitle)}</strong>` : 'your project'
    } to the role of <strong>${ejs.escapeXML(roleName)}</strong>.`;

    return {
      subject: 'You have a new access request',
      title: 'Hey friend',
      preheader: payload.requesterEmail ? `from ${payload.requesterEmail}` : description,
      description,
      descriptionHtml,
      details:
        'Kindly navigate to the Members page in your project to review and approve this request.',
      detailsHtml: `Kindly navigate to the <a href="${ejs.escapeXML(membersUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">Members</a> page in your project to review and approve this request.`,
      buttonText: 'Check request',
      actionUrl: membersUrl,
      footer: 'You received this email because you are an admin of this project.',
    };
  }

  private buildApprovalContent(payload: AccessApprovalEmailPayload): ActionEmailContent {
    const roleName = getRoleDisplayName(payload.role);
    const projectTitle = payload.projectTitle ? formatProjectTitle(payload.projectTitle) : '';

    return {
      subject: 'OWOX Project access is confirmed',
      title: 'Hey friend',
      description: `You have been granted ${roleName} access to ${
        projectTitle || 'the OWOX project'
      }.`,
      descriptionHtml: `You have been granted <strong>${ejs.escapeXML(roleName)}</strong> access to ${
        projectTitle ? `<strong>${ejs.escapeXML(projectTitle)}</strong>` : 'the OWOX project'
      }.`,
      details: 'To access the project page, please click the link below.',
      buttonText: 'Join now',
      actionUrl: this.projectUrl(payload.projectId, 'data-marts'),
      footer: 'You received this email because you asked for access to this project.',
    };
  }

  private projectUrl(projectId: string, page: string): string {
    return `${this.appBaseUrl}/ui/${encodeURIComponent(projectId)}/${page}`;
  }
}
