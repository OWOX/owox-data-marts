import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFacade } from '../shared/email-provider.facade';

/**
 * Noop email provider that does nothing.
 */
@Injectable()
export class NoopEmailProvider implements EmailProviderFacade {
  private readonly logger = new Logger(NoopEmailProvider.name);

  async sendEmail(): Promise<void> {
    this.logger.error('Email provider is not configured.');
  }
}
