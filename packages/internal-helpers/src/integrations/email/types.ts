export type EmailRecipient = string | string[];

/**
 * Minimal email sender contract.
 */
export interface EmailProvider {
  sendEmail(to: EmailRecipient, subject: string, bodyHtml: string): Promise<void>;
}

/**
 * Supported provider names.
 */
export type EmailProviderName = 'sendgrid' | 'none';

/**
 * Logger interface kept small to avoid framework coupling.
 */
export interface EmailLogger {
  error?(message: string, error?: unknown): void;
}
