import { InjectionToken } from '@nestjs/common';
import type { EmailProvider } from '@owox/internal-helpers';

export const NOTIFICATIONS_EMAIL_PROVIDER_FACADE =
  'NOTIFICATIONS_EMAIL_PROVIDER_FACADE' as InjectionToken<NotificationsEmailProviderFacade>;

/**
 * Interface for email provider facade.
 *
 * All email sending operations should be handled through this facade.
 */
export type NotificationsEmailProviderFacade = EmailProvider;
