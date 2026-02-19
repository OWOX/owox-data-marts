import sendgrid from '@sendgrid/mail';
import type { EmailProvider, EmailRecipient, EmailSendOptions } from '../types.js';

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

    sendgrid.setApiKey(apiKey);
    this.sender = { email: verifiedSenderEmail, name: verifiedSenderName };
  }

  async sendEmail(
    to: EmailRecipient,
    subject: string,
    bodyHtml: string,
    options?: EmailSendOptions
  ): Promise<void> {
    await sendgrid.send({
      from: this.sender,
      to,
      subject,
      html: bodyHtml,
      text: options?.bodyText,
      categories: options?.categories,
      isMultiple: options?.isMultiple ?? true,
    });
  }
}
