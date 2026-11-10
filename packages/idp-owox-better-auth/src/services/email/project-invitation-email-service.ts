import type { Role } from '@owox/idp-protocol';
import type { EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import { createServiceLogger } from '../../core/logger.js';
import { maskEmail } from '../../utils/email-utils.js';
import { resolveResourcePath } from '../../utils/template-paths.js';

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  admin: 'Project Admin',
  editor: 'Data Owner',
  viewer: 'Business User',
};

const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

interface InvitationViewModel {
  subject: string;
  title: string;
  preheader: string;
  /** Plain-text body sentence. */
  description: string;
  /** The same sentence as escaped HTML with the project and the role in bold. */
  descriptionHtml: string;
  buttonText: string;
  actionUrl: string;
  footer: string;
}

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
  private readonly logger = createServiceLogger(ProjectInvitationEmailService.name);
  private readonly template: string;
  private readonly appBaseUrl: string;

  /**
   * @param appBaseUrl public origin of the app; the email links to the project there.
   * @param retryDelaysMs pauses between attempts; one more attempt than delays.
   */
  constructor(
    private readonly emailProvider: EmailProvider,
    appBaseUrl: string,
    private readonly retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS
  ) {
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, '');
    this.template = readFileSync(resolveResourcePath('templates/email/action-email.ejs'), 'utf-8');
  }

  /**
   * Sends the invitation, retrying failed attempts. Throws the last error when all attempts fail.
   */
  async send(payload: ProjectInvitationEmailPayload): Promise<void> {
    const viewModel = this.buildViewModel(payload);
    const html = ejs.render(this.template, { ...viewModel });
    const plainText = [
      viewModel.title,
      '',
      viewModel.description,
      '',
      `${viewModel.buttonText}: ${viewModel.actionUrl}`,
      '',
      viewModel.footer,
    ].join('\n');

    for (let attempt = 0; ; attempt++) {
      try {
        await this.emailProvider.sendEmail(payload.email, viewModel.subject, html, {
          bodyText: plainText,
          categories: ['transactional', 'project-invitation'],
          isMultiple: false,
        });
        return;
      } catch (error) {
        if (attempt >= this.retryDelaysMs.length) {
          throw error;
        }
        this.logger.warn(
          'Project invitation email attempt failed, retrying',
          { email: maskEmail(payload.email), projectId: payload.projectId, attempt: attempt + 1 },
          error
        );
        await sleep(this.retryDelaysMs[attempt] ?? 0);
      }
    }
  }

  /**
   * The wording follows the invitation email users received before OWOX Data Marts
   * sent it itself. The invited person's first name is not known reliably, so the
   * greeting uses its fallback.
   */
  private buildViewModel(payload: ProjectInvitationEmailPayload): InvitationViewModel {
    const projectTitle = payload.projectTitle ? formatProjectTitle(payload.projectTitle) : '';
    const roleName = ROLE_DISPLAY_NAMES[payload.role] ?? payload.role;
    const byInviter = payload.inviterEmail ? ` by user ${payload.inviterEmail}` : '';
    const description = `You have been invited${byInviter} to join ${
      projectTitle || 'the OWOX project'
    } as a ${roleName}.`;
    const descriptionHtml = `You have been invited${escapeHtml(byInviter)} to join ${
      projectTitle ? `<strong>${escapeHtml(projectTitle)}</strong>` : 'the OWOX project'
    } as a <strong>${escapeHtml(roleName)}</strong>.`;

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

/**
 * Mail clients turn domain-like text such as "acme.com" into links,
 * so dots in a project title become spaces.
 */
function formatProjectTitle(title: string): string {
  return title.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
