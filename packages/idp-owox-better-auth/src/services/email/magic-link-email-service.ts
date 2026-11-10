import type { EmailProvider } from '@owox/internal-helpers';
import { MAGIC_LINK_INTENT } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { MagicLinkEmailPayload, MagicLinkIntent } from '../../types/index.js';
import { maskEmail } from '../../utils/email-utils.js';
import { renderActionEmail, type ActionEmailContent } from './action-email-sender.js';

/**
 * Renders and sends magic-link emails using one shared template.
 */
export class MagicLinkEmailService {
  private readonly logger = createServiceLogger(MagicLinkEmailService.name);

  constructor(private readonly emailProvider: EmailProvider) {}

  private buildContent(payload: MagicLinkEmailPayload): ActionEmailContent {
    const intent: MagicLinkIntent =
      payload.intent === MAGIC_LINK_INTENT.RESET ? MAGIC_LINK_INTENT.RESET : payload.intent;
    const isReset = intent === MAGIC_LINK_INTENT.RESET;

    return {
      subject: isReset ? 'Reset your password' : 'Confirm your email',
      title: isReset ? 'Reset your password' : 'Confirm your email',
      description: isReset
        ? 'Click the button below to reset your password. This link is valid for 1 hour.'
        : 'Click the button below to confirm your email and finish setting your password. This link is valid for 1 hour.',
      buttonText: isReset ? 'Reset password' : 'Confirm email',
      actionUrl: payload.magicLink,
      footer: 'If you did not request this, you can safely ignore this email.',
    };
  }

  async send(payload: MagicLinkEmailPayload): Promise<void> {
    const content = this.buildContent(payload);
    const { html, bodyText } = renderActionEmail(content);
    try {
      await this.emailProvider.sendEmail(payload.email, content.subject, html, {
        bodyText,
        categories: ['transactional', 'auth'],
        isMultiple: false,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send magic link email',
        { email: maskEmail(payload.email) },
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }
}
