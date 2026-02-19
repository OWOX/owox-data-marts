export { createMailingProvider, type MailingFactoryConfig } from './factory.js';
export { NoopMailingProvider } from './providers/noop-provider.js';
export {
  SendgridMailingProvider,
  type SendgridMailingConfig,
} from './providers/sendgrid-provider.js';
export type {
  EmailProvider,
  EmailRecipient,
  EmailSendOptions,
  EmailLogger,
  EmailProviderName,
} from './types.js';
