import { getRoleDisplayName, type Role } from '@owox/idp-protocol';
import { isTransientEmailError, type EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import { createServiceLogger } from '../../core/logger.js';
import { maskEmail } from '../../utils/email-utils.js';
import { resolveResourcePath } from '../../utils/template-paths.js';

/**
 * The invite request waits for this email after the access check (up to 3 s) and the invite
 * itself (up to 10 s), and the backend answers 408 after 30 s. So one send gets 12 s in total:
 * attempts of up to 5 s, with 0.5 s and 1.5 s pauses, while time is left.
 */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 1500];
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5000;
const DEFAULT_TOTAL_TIMEOUT_MS = 12000;

export interface ProjectInvitationEmailOptions {
  /** Pauses between attempts; there is one more attempt than pauses. */
  retryDelaysMs?: readonly number[];
  /** How long one attempt may take before it is aborted. */
  attemptTimeoutMs?: number;
  /** How long the whole send, retries included, may take. */
  totalTimeoutMs?: number;
}

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
  private readonly retryDelaysMs: readonly number[];
  private readonly attemptTimeoutMs: number;
  private readonly totalTimeoutMs: number;

  /**
   * @param appBaseUrl public origin of the app; the email links to the project there.
   */
  constructor(
    private readonly emailProvider: EmailProvider,
    appBaseUrl: string,
    options: ProjectInvitationEmailOptions = {}
  ) {
    this.appBaseUrl = appBaseUrl.replace(/\/+$/, '');
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    this.totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    this.template = readFileSync(resolveResourcePath('templates/email/action-email.ejs'), 'utf-8');
  }

  /**
   * Sends the invitation, retrying attempts that fail for a transient reason while the
   * time budget lasts. Throws the last error otherwise.
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
    const deadline = Date.now() + this.totalTimeoutMs;

    for (let attempt = 0; ; attempt++) {
      try {
        await this.sendAttempt(
          payload.email,
          viewModel.subject,
          html,
          plainText,
          Math.min(this.attemptTimeoutMs, deadline - Date.now())
        );
        return;
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];
        if (
          delay === undefined ||
          !isTransientEmailError(error) ||
          Date.now() + delay >= deadline
        ) {
          throw error;
        }
        this.logger.warn(
          'Project invitation email attempt failed, retrying',
          { email: maskEmail(payload.email), projectId: payload.projectId, attempt: attempt + 1 },
          error
        );
        await sleep(delay);
      }
    }
  }

  private async sendAttempt(
    to: string,
    subject: string,
    html: string,
    bodyText: string,
    timeoutMs: number
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Email attempt timeout after ${String(timeoutMs)} ms`)),
      timeoutMs
    );
    try {
      await this.emailProvider.sendEmail(to, subject, html, {
        bodyText,
        categories: ['transactional', 'project-invitation'],
        isMultiple: false,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The wording follows the invitation email users received before OWOX Data Marts
   * sent it itself. The invited person's first name is not known reliably, so the
   * greeting uses its fallback.
   */
  private buildViewModel(payload: ProjectInvitationEmailPayload): InvitationViewModel {
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

/**
 * Mail clients turn domain-like text such as "acme.com" into links,
 * so dots in a project title become spaces.
 */
function formatProjectTitle(title: string): string {
  return title.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
