import type { EmailLogger, EmailProvider } from '../types.js';

const NOOP_ERROR_MESSAGE =
  'Email provider is not configured in your app environment. Please check your configuration.';

/**
 * No-op provider: logs and throws on send.
 */
export class NoopMailingProvider implements EmailProvider {
  constructor(private readonly logger: EmailLogger = console) {}

  async sendEmail(..._args: Parameters<EmailProvider['sendEmail']>): Promise<void> {
    this.logger.error?.(NOOP_ERROR_MESSAGE);
    throw new Error(NOOP_ERROR_MESSAGE);
  }
}
