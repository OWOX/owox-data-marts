import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NOTIFICATION_DEFINITIONS } from '../definitions';
import { NotificationContext } from '../types/notification-context';

@Injectable()
export class NotificationWebhookService {
  private readonly logger = new Logger(NotificationWebhookService.name);
  private readonly WEBHOOK_TIMEOUT_MS = 10000;

  constructor(private readonly configService: ConfigService) {}

  async sendWebhook(
    queueItem: NotificationPendingQueue,
    settings: ProjectNotificationSettings
  ): Promise<void> {
    if (!settings.webhookUrl) return;

    const handler = NOTIFICATION_DEFINITIONS[settings.notificationType];
    if (!handler) {
      this.logger.error(`No handler found for notification type: ${settings.notificationType}`);
      return;
    }

    const appUrl = this.configService.get<string>('APP_URL');
    const payload = handler.getWebhookPayload(queueItem, { appUrl });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.WEBHOOK_TIMEOUT_MS);

      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OWOX-DataMarts-Webhook/1.0',
          'X-Webhook-ID': payload.id,
          'X-Event-Type': payload.event,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(
        `Webhook sent to ${settings.webhookUrl} for ${settings.notificationType} notification`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to send webhook to ${settings.webhookUrl}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  async sendWebhooksForQueueItems(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings
  ): Promise<void> {
    if (!settings.webhookUrl) return;

    for (const item of queueItems) {
      await this.sendWebhook(item, settings);
    }
  }

  async sendTestWebhook(
    webhookUrl: string,
    notificationType: NotificationType,
    projectId: string,
    context?: { userId?: string; projectTitle?: string }
  ): Promise<void> {
    const handler = NOTIFICATION_DEFINITIONS[notificationType];
    if (!handler) {
      throw new Error(`No handler found for notification type: ${notificationType}`);
    }

    const appUrl = this.configService.get<string>('APP_URL');
    const notificationContext: NotificationContext = {
      projectId,
      projectTitle: context?.projectTitle,
      userId: context?.userId,
    };
    const testPayload = handler.getTestWebhookPayload(notificationContext, { appUrl });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OWOX-DataMarts-Webhook/1.0',
          'X-Webhook-ID': testPayload.id,
          'X-Event-Type': testPayload.event,
        },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(`Test webhook sent successfully to ${webhookUrl}`);
    } catch (error) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send test webhook to ${webhookUrl}: ${errorMessage}`);
      throw error;
    }
  }
}
