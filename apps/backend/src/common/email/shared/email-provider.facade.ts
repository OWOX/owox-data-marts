import { InjectionToken } from '@nestjs/common';

export const EMAIL_PROVIDER_FACADE = 'EMAIL_PROVIDER_FACADE' as InjectionToken<EmailProviderFacade>;

/**
 * Interface for email provider facade.
 *
 * All email sending operations should be handled through this facade.
 */
export interface EmailProviderFacade {
  sendEmail(to: string | string[], subject: string, bodyHtml: string): Promise<void>;
}
