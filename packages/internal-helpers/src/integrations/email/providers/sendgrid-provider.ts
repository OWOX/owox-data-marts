import sendgrid from '@sendgrid/mail';
import type { EmailProvider, EmailRecipient } from '../types.js';

export interface SendgridMailingConfig {
  apiKey: string;
  verifiedSenderEmail: string;
  verifiedSenderName?: string;
}

/**
 * Send emails via SendGrid API.
 */
export class SendgridMailingProvider implements EmailProvider {
  private readonly sender: { email: string; name?: string };

  constructor(config: SendgridMailingConfig) {
    const { apiKey, verifiedSenderEmail, verifiedSenderName } = config;

    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY is not provided');
    }
    if (!verifiedSenderEmail) {
      throw new Error('SENDGRID_VERIFIED_SENDER_EMAIL is not provided');
    }

    sendgrid.setApiKey(apiKey);
    this.sender = { email: verifiedSenderEmail, name: verifiedSenderName };
  }

  async sendEmail(to: EmailRecipient, subject: string, bodyHtml: string): Promise<void> {
    await sendgrid.send({
      from: this.sender,
      to,
      subject,
      html: bodyHtml,
      isMultiple: true,
    });
  }
}
