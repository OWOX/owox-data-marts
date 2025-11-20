import { ConfigService } from '@nestjs/config';
import sendgrid from '@sendgrid/mail';
import { EmailProviderFacade } from '../shared/email-provider.facade';

/**
 * The SendgridProvider class serves as a messaging provider for sending emails via the SendGrid API.
 * It ensures that every email is sent using a verified sender email and optionally includes a sender name.
 *
 * The SendgridProvider class implements the EmailProviderFacade interface to provide an abstraction for
 * email-related functionalities.
 *
 * The class requires a configuration service to fetch necessary credentials and settings, including:
 * - SENDGRID_API_KEY: The API key for authenticating with the SendGrid service.
 * - SENDGRID_VERIFIED_SENDER_EMAIL: The verified sender email address for sending emails.
 * - SENDGRID_VERIFIED_SENDER_NAME (optional): The optional sender name to be displayed in sent emails.
 *
 * If any required configuration values are missing, an error will be thrown during instantiation.
 */
export class SendgridProvider implements EmailProviderFacade {
  private readonly verifiedSenderEmail: string;
  private readonly verifiedSenderName: string | undefined;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY is not provided');
    }
    sendgrid.setApiKey(apiKey);

    const verifiedSenderEmail = configService.get<string>('SENDGRID_VERIFIED_SENDER_EMAIL');
    if (!verifiedSenderEmail) {
      throw new Error('SENDGRID_VERIFIED_SENDER_EMAIL is not provided');
    }
    this.verifiedSenderEmail = verifiedSenderEmail;

    // sender name is optional
    this.verifiedSenderName = configService.get<string>('SENDGRID_VERIFIED_SENDER_NAME');
  }

  public async sendEmail(to: string | string[], subject: string, bodyHtml: string): Promise<void> {
    await sendgrid.send({
      from: { email: this.verifiedSenderEmail, name: this.verifiedSenderName },
      to: to,
      subject,
      html: bodyHtml,
      isMultiple: true,
    });
  }
}
