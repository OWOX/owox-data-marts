import { castError } from '../../../utils/castError.js';
import type { EmailProvider, EmailRecipient, EmailSendOptions } from '../types.js';

const SENDGRID_MAIL_SEND_URL = 'https://api.sendgrid.com/v3/mail/send';
const MAX_ERROR_DETAIL_LENGTH = 500;

export interface SendgridMailingConfig {
  apiKey: string;
  verifiedSenderEmail: string;
  verifiedSenderName?: string;
}

/**
 * Send emails via SendGrid API.
 */
export class SendgridMailingProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly sender: { email: string; name?: string };

  constructor(config: SendgridMailingConfig) {
    if (!config) {
      throw new Error('SendGrid config is required');
    }

    const { apiKey, verifiedSenderEmail, verifiedSenderName } = config;

    if (!apiKey) {
      throw new Error('SendGrid config is missing apiKey');
    }
    if (!verifiedSenderEmail) {
      throw new Error('SendGrid config is missing verifiedSenderEmail');
    }

    // fetch rejects a header containing these and quotes the whole value, key included, in its error.
    this.apiKey = apiKey.replace(/[\0\r\n]/g, '');
    this.sender = { email: verifiedSenderEmail, name: verifiedSenderName || undefined };
  }

  async sendEmail(
    to: EmailRecipient,
    subject: string,
    bodyHtml: string,
    options?: EmailSendOptions
  ): Promise<void> {
    const recipients = (Array.isArray(to) ? to : [to]).map(email => ({ email }));
    // One personalization per recipient sends separate emails, so recipients don't see each other.
    const personalizations =
      (options?.isMultiple ?? true) ? recipients.map(r => ({ to: [r] })) : [{ to: recipients }];
    // SendGrid requires text/plain before text/html.
    const content = [
      ...(options?.bodyText === undefined ? [] : [{ type: 'text/plain', value: options.bodyText }]),
      { type: 'text/html', value: bodyHtml },
    ];

    let response: Response;
    try {
      response = await fetch(SENDGRID_MAIL_SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations,
          from: this.sender,
          subject,
          content,
          categories: options?.categories,
        }),
      });
    } catch (error) {
      // fetch says only 'fetch failed'; callers retry on 'network' or the errno code.
      throw new Error(`SendGrid network error: ${describeFetchFailure(error)}`, { cause: error });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `SendGrid responded ${response.status} ${response.statusText}: ${describeErrorBody(body)}`
      );
    }
    await response.body?.cancel().catch(() => undefined);
  }
}

function describeFetchFailure(error: unknown): string {
  const cause = castError(castError(error).cause ?? error);
  // A connect that fails on every address is an AggregateError with an empty message.
  const inner = cause instanceof AggregateError ? cause.errors.map(e => castError(e).message) : [];
  const { code } = cause as { code?: string };
  return [code, cause.message, ...inner].filter(Boolean).join(' ');
}

function describeErrorBody(body: string): string {
  try {
    const { errors } = JSON.parse(body) as { errors?: { message?: string }[] };
    const messages = errors?.map(e => e.message).filter(Boolean);
    if (messages?.length) return messages.join('; ').slice(0, MAX_ERROR_DETAIL_LENGTH);
  } catch {
    // Not SendGrid's JSON, e.g. a proxy's HTML error page.
  }
  return body.slice(0, MAX_ERROR_DETAIL_LENGTH);
}
