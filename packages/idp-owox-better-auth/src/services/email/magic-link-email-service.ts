import type { EmailProvider } from '@owox/internal-helpers';
import ejs from 'ejs';
import { readFileSync } from 'fs';
import { logger } from '../../core/logger.js';
import { resolveResourcePath } from '../../utils/template-paths.js';

export type MagicLinkIntent = 'signup' | 'reset' | undefined;

export interface MagicLinkEmailPayload {
  email: string;
  magicLink: string;
  intent?: MagicLinkIntent;
}

/**
 * Renders and sends magic-link emails using one shared template.
 */
export class MagicLinkEmailService {
  private readonly template: string;

  constructor(private readonly emailProvider: EmailProvider) {
    this.template = this.loadTemplate();
  }

  private loadTemplate(): string {
    const templatePath = resolveResourcePath('templates/email/magic-link-email.ejs');
    return readFileSync(templatePath, 'utf-8');
  }

  private buildViewModel(payload: MagicLinkEmailPayload): Record<string, string> {
    const intent: MagicLinkIntent = payload.intent === 'reset' ? 'reset' : payload.intent;
    const isReset = intent === 'reset';

    return {
      title: isReset ? 'Reset your password' : 'Confirm your email',
      description: isReset
        ? 'Click the button below to reset your password. The link will expire soon.'
        : 'Click the button below to confirm your email and finish setting your password.',
      buttonText: isReset ? 'Reset password' : 'Confirm email',
      magicLink: payload.magicLink,
      footer: 'If you did not request this, you can safely ignore this email.',
    };
  }

  private buildSubject(intent: MagicLinkIntent): string {
    return intent === 'reset' ? 'Reset your password' : 'Confirm your email';
  }

  render(payload: MagicLinkEmailPayload): string {
    const viewModel = this.buildViewModel(payload);
    return ejs.render(this.template, viewModel);
  }

  async send(payload: MagicLinkEmailPayload): Promise<void> {
    const html = this.render(payload);
    const subject = this.buildSubject(payload.intent);
    try {
      await this.emailProvider.sendEmail(payload.email, subject, html);
    } catch (error) {
      logger.error('Failed to send magic link email', { email: payload.email }, error as Error);
      throw error;
    }
  }
}
