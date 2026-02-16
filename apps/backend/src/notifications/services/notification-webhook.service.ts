import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dns from 'node:dns/promises';
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

  /**
   * Throws if the URL targets a loopback, private, or link-local address.
   * Protects against SSRF: an editor could otherwise use a webhook to probe
   * internal services (e.g. http://169.254.169.254/ AWS metadata endpoint).
   *
   * Both the literal hostname and its resolved IP addresses are checked
   * to prevent DNS rebinding attacks.
   */
  private async assertSafeWebhookUrl(rawUrl: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid webhook URL: ${rawUrl}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Webhook URL must use http or https protocol`);
    }

    // Strip IPv6 brackets (e.g. [::1] → ::1)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
      throw new Error(`Webhook URL targets an internal address`);
    }

    this.assertNotPrivateIpv4(hostname);

    // Resolve DNS and check resolved IPs to prevent DNS rebinding
    const ipv4Addresses = await dns.resolve4(hostname).catch(() => []);
    const ipv6Addresses = await dns.resolve6(hostname).catch(() => []);

    for (const addr of ipv4Addresses) {
      this.assertNotPrivateIpv4(addr);
    }

    for (const addr of ipv6Addresses) {
      const normalized = addr.toLowerCase();
      if (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fe80:') ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd')
      ) {
        throw new Error(`Webhook URL resolves to an internal address`);
      }
    }
  }

  private assertNotPrivateIpv4(hostname: string): void {
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      const isPrivate =
        a === 0 || // 0.0.0.0/8
        a === 10 || // 10.0.0.0/8
        a === 127 || // 127.0.0.0/8 loopback
        (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 shared
        (a === 169 && b === 254) || // 169.254.0.0/16 link-local / cloud metadata
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        a >= 240; // 240.0.0.0/4 reserved
      if (isPrivate) {
        throw new Error(`Webhook URL targets an internal address`);
      }
    }
  }

  async sendWebhook(
    queueItem: NotificationPendingQueue,
    settings: ProjectNotificationSettings
  ): Promise<void> {
    if (!settings.webhookUrl) return;

    try {
      await this.assertSafeWebhookUrl(settings.webhookUrl);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.WEBHOOK_TIMEOUT_MS);

    try {
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
      clearTimeout(timeoutId);
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
    await this.assertSafeWebhookUrl(webhookUrl);

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
