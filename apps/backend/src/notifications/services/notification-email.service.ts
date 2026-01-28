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
}

@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);

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

    try {
      const appUrl = this.configService.get<string>('APP_URL');
      const { subject, bodyHtml } = handler.getEmailContent(queueItems, settings, { appUrl });

      await this.emailProvider.sendEmail(receiver.email, subject, bodyHtml);

      this.logger.log(
        `Email sent to ${receiver.email} for ${queueItems.length} ${notificationType} notifications`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to send email to ${receiver.email}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}
