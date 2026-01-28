import { LoggerFactory, LogLevel } from '@owox/internal-helpers';
import sendgrid from '@sendgrid/mail';

export class EmailService {
  private readonly logger = LoggerFactory.createNamedLogger('better-auth-email');
  private readonly apiKey = process.env.SENDGRID_API_KEY;
  private readonly senderEmail = process.env.SENDGRID_VERIFIED_SENDER_EMAIL;
  private readonly senderName = process.env.SENDGRID_VERIFIED_SENDER_NAME;
  private readonly enabled: boolean;

  constructor() {
    if (!this.apiKey) {
      this.logger.log(LogLevel.WARN, 'Sendgrid disabled: missing SENDGRID_API_KEY');
      this.enabled = false;
      return;
    }
    if (!this.senderEmail) {
      this.logger.log(LogLevel.WARN, 'Sendgrid disabled: missing SENDGRID_VERIFIED_SENDER_EMAIL');
      this.enabled = false;
      return;
    }
    sendgrid.setApiKey(this.apiKey);
    this.enabled = true;
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await sendgrid.send({
        from: {
          email: this.senderEmail as string,
          name: this.senderName,
        },
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.log(LogLevel.ERROR, 'Failed to send email via Sendgrid', { to, subject, error });
    }
  }
}
