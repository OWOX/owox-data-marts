import type { EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import { createServiceLogger } from '../../core/logger.js';
import { maskEmail } from '../../utils/email-utils.js';
import { resolveResourcePath } from '../../utils/template-paths.js';

/**
 * At most 3 attempts of 5 s with 0.5 s and 1.5 s pauses: one send ends within about 17 s,
 * well under the web client's 30 s timeout when a request waits for it.
 */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 1500];
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5000;

export interface ActionEmailSendOptions {
  /** Pauses between attempts; there is one more attempt than pauses. */
  retryDelaysMs?: readonly number[];
  /** How long one attempt may take before it is aborted. */
  attemptTimeoutMs?: number;
}

/**
 * Content of an email rendered with `action-email.ejs`: a heading, one sentence and a button.
 */
export interface ActionEmailContent {
  subject: string;
  title: string;
  /** Inbox preview text; the description when empty. */
  preheader?: string;
  /** Plain-text body sentence. */
  description: string;
  /** The same sentence as HTML. The caller escapes everything except the tags it adds. */
  descriptionHtml?: string;
  /** Optional second paragraph, plain text. */
  details?: string;
  /** The second paragraph as HTML, escaped by the caller like `descriptionHtml`. */
  detailsHtml?: string;
  buttonText: string;
  actionUrl: string;
  footer: string;
}

export interface ActionEmailMessage {
  to: string;
  content: ActionEmailContent;
  categories: string[];
  /** Extra fields for the retry log, such as the project ID. */
  logContext?: Record<string, unknown>;
}

/**
 * Renders `action-email.ejs` and sends it, retrying failed attempts.
 */
export class ActionEmailSender {
  private readonly logger = createServiceLogger(ActionEmailSender.name);
  private readonly template: string;
  private readonly retryDelaysMs: readonly number[];
  private readonly attemptTimeoutMs: number;

  constructor(
    private readonly emailProvider: EmailProvider,
    options: ActionEmailSendOptions = {}
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    this.template = readFileSync(resolveResourcePath('templates/email/action-email.ejs'), 'utf-8');
  }

  /**
   * Sends the email. Throws the last error when all attempts fail.
   */
  async send({ to, content, categories, logContext }: ActionEmailMessage): Promise<void> {
    const html = ejs.render(this.template, { ...content });
    const bodyText = [
      content.title,
      '',
      content.description,
      ...(content.details ? ['', content.details] : []),
      '',
      `${content.buttonText}: ${content.actionUrl}`,
      '',
      content.footer,
    ].join('\n');

    for (let attempt = 0; ; attempt++) {
      try {
        await this.emailProvider.sendEmail(to, content.subject, html, {
          bodyText,
          categories,
          isMultiple: false,
          signal: AbortSignal.timeout(this.attemptTimeoutMs),
        });
        return;
      } catch (error) {
        if (attempt >= this.retryDelaysMs.length) {
          throw error;
        }
        this.logger.warn(
          'Email attempt failed, retrying',
          { ...logContext, email: maskEmail(to), categories, attempt: attempt + 1 },
          error
        );
        await sleep(this.retryDelaysMs[attempt] ?? 0);
      }
    }
  }
}

/**
 * Mail clients turn domain-like text such as "acme.com" into links,
 * so dots in a project title become spaces.
 */
export function formatProjectTitle(title: string): string {
  return title.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
