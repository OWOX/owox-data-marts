import { InjectionToken } from '@nestjs/common';
import type { EmailProvider } from '@owox/internal-helpers';

export const EMAIL_PROVIDER_FACADE = 'EMAIL_PROVIDER_FACADE' as InjectionToken<EmailProviderFacade>;

/**
 * Interface for email provider facade.
 *
 * All email sending operations should be handled through this facade.
 */
export type EmailProviderFacade = EmailProvider;
