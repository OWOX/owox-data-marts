export type EmailRecipient = string | string[];

export interface EmailSendOptions {
  bodyText?: string;
  categories?: string[];
  isMultiple?: boolean;
  /** Aborts the send, e.g. when the caller's time budget runs out. */
  signal?: AbortSignal;
}

/**
 * Minimal email sender contract.
 */
export interface EmailProvider {
  sendEmail(
    to: EmailRecipient,
    subject: string,
    bodyHtml: string,
    options?: EmailSendOptions
  ): Promise<void>;
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
