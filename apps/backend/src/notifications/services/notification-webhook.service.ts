import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertPublicHttpUrl, fetchPublicUrl } from '../../common/helpers/safe-url.helper';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NOTIFICATION_DEFINITIONS } from '../definitions';
import { NotificationContext } from '../types/notification-context';
import { WebhookPayload } from '../types/notification-data.interface';

@Injectable()
export class NotificationWebhookService {
  private readonly logger = new Logger(NotificationWebhookService.name);
  private readonly WEBHOOK_TIMEOUT_MS = 10000;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RETRY_DELAYS_MS = [1000, 3000];

  constructor(private readonly configService: ConfigService) {}

  async sendWebhook(
    queueItem: NotificationPendingQueue,
    settings: ProjectNotificationSettings
  ): Promise<void> {
    if (!settings.webhookUrl) return;

    try {
      await assertPublicHttpUrl(settings.webhookUrl);
    } catch (error) {
      this.logger.error(
        `Blocked unsafe webhook URL for ${settings.notificationType}: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    const handler = NOTIFICATION_DEFINITIONS[settings.notificationType];
    if (!handler) {
      this.logger.error(`No handler found for notification type: ${settings.notificationType}`);
      return;
    }

    const appUrl = this.configService.get<string>('APP_URL');
    const payload = handler.getWebhookPayload(queueItem, { appUrl });
    const label = `webhook to ${settings.webhookUrl}`;

    await this.withRetry(() => this.fetchWebhook(settings.webhookUrl!, payload), label);

    this.logger.log(
      `Webhook sent to ${settings.webhookUrl} for ${settings.notificationType} notification`
    );
  }

  private async fetchWebhook(url: string, payload: WebhookPayload): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetchPublicUrl(url, {
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
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async withRetry(fn: () => Promise<void>, label: string): Promise<void> {
    for (let attempt = 1; attempt <= NotificationWebhookService.MAX_ATTEMPTS; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        const isLastAttempt = attempt === NotificationWebhookService.MAX_ATTEMPTS;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (isLastAttempt || !this.isTransientError(error)) {
          this.logger.error(
            `Failed to send ${label} after ${attempt} attempt(s): ${errorMessage}`,
            error instanceof Error ? error.stack : undefined
          );
          return;
        }

        const delay = NotificationWebhookService.RETRY_DELAYS_MS[attempt - 1] ?? 3000;
        this.logger.warn(
          `Transient error sending ${label} (attempt ${attempt}/${NotificationWebhookService.MAX_ATTEMPTS}): ${errorMessage}. Retrying in ${delay}ms...`
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
      msg.includes('aborted') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      /\bHTTP 5\d{2}\b/i.test(error.message) ||
      msg.includes('429')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendWebhooksForQueueItems(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings
  ): Promise<void> {
    if (!settings.webhookUrl) return;

    const CONCURRENCY = 5;
    for (let i = 0; i < queueItems.length; i += CONCURRENCY) {
      const batch = queueItems.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(item => this.sendWebhook(item, settings)));
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
      const response = await fetchPublicUrl(webhookUrl, {
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
