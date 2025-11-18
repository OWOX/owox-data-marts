import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFacade } from '../shared/email-provider.facade';

const NOOP_ERROR_MESSAGE =
  'Email provider is not configured in your app environment. Please check your configuration.';

/**
 * Noop email provider that does nothing.
 */
@Injectable()
export class NoopEmailProvider implements EmailProviderFacade {
  private readonly logger = new Logger(NoopEmailProvider.name);

  async sendEmail(): Promise<void> {
    this.logger.error(NOOP_ERROR_MESSAGE);
    throw new Error(NOOP_ERROR_MESSAGE);
  }
}
