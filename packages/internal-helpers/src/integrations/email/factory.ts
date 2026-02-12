import { NoopMailingProvider } from './providers/noop-provider.js';
import {
  SendgridMailingProvider,
  type SendgridMailingConfig,
} from './providers/sendgrid-provider.js';
import { type EmailProvider, type EmailLogger, type EmailProviderName } from './types.js';

export interface MailingFactoryConfig {
  /**
   * Which provider to build. Currently: sendgrid | none.
   */
  provider: EmailProviderName;
  /**
   * SendGrid credentials and sender info. Required when provider = sendgrid.
   */
  sendgrid?: SendgridMailingConfig;
  /**
   * Optional logger for noop provider.
   */
  logger?: EmailLogger;
}

/**
 * Create a mailing provider instance from an explicit config object.
 * No environment reads happen here; caller must pass all needed values.
 */
export function createMailingProvider(config: MailingFactoryConfig): EmailProvider {
  const provider = config.provider.toLowerCase() as EmailProviderName;

  switch (provider) {
    case 'sendgrid':
      return new SendgridMailingProvider(config.sendgrid as SendgridMailingConfig);
    case 'none':
      return new NoopMailingProvider(config.logger);
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER=${config.provider}. Allowed: sendgrid|none`);
  }
}
