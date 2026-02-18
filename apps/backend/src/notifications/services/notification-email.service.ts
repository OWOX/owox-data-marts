import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NOTIFICATION_DEFINITIONS } from '../definitions';
import {
  NOTIFICATIONS_EMAIL_PROVIDER_FACADE,
  NotificationsEmailProviderFacade,
} from '../types/email-provider.facade';

export interface UserInfo {
  userId: string;
  email: string;
  fullName?: string;
  hasNotificationsEnabled: boolean;
}

@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RETRY_DELAYS_MS = [1000, 3000];

  constructor(
    @Inject(NOTIFICATIONS_EMAIL_PROVIDER_FACADE)
    private readonly emailProvider: NotificationsEmailProviderFacade,
    private readonly configService: ConfigService
  ) {}

  async sendBatchedEmail(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings,
    receiver: UserInfo
  ): Promise<void> {
    if (queueItems.length === 0) return;

    const notificationType = settings.notificationType;
    const handler = NOTIFICATION_DEFINITIONS[notificationType];

    if (!handler) {
      this.logger.error(`No handler found for notification type: ${notificationType}`);
      return;
    }

    const appUrl = this.configService.get<string>('PUBLIC_ORIGIN');
    const { subject, bodyHtml } = handler.getEmailContent(queueItems, settings, { appUrl });

    await this.withRetry(
      () => this.emailProvider.sendEmail(receiver.email, subject, bodyHtml),
      `email to ${receiver.email}`
    );

    this.logger.log(
      `Email sent to ${receiver.email} for ${queueItems.length} ${notificationType} notifications`
    );
  }

  private async withRetry(fn: () => Promise<void>, label: string): Promise<void> {
    for (let attempt = 1; attempt <= NotificationEmailService.MAX_ATTEMPTS; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        const isLastAttempt = attempt === NotificationEmailService.MAX_ATTEMPTS;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (isLastAttempt || !this.isTransientError(error)) {
          this.logger.error(
            `Failed to send ${label} after ${attempt} attempt(s): ${errorMessage}`,
            error instanceof Error ? error.stack : undefined
          );
          throw error;
        }

        const delay = NotificationEmailService.RETRY_DELAYS_MS[attempt - 1] ?? 3000;
        this.logger.warn(
          `Transient error sending ${label} (attempt ${attempt}/${NotificationEmailService.MAX_ATTEMPTS}): ${errorMessage}. Retrying in ${delay}ms...`
        );
        await this.sleep(delay);
      }
    }
  }

  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('429')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
