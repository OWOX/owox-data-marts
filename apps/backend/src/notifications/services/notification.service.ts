import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '../enums/notification-type.enum';
import { ProjectNotificationSettingsService } from './project-notification-settings.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationEmailService, UserInfo } from './notification-email.service';
import { NotificationWebhookService } from './notification-webhook.service';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly queueService: NotificationQueueService,
    private readonly emailService: NotificationEmailService,
    private readonly webhookService: NotificationWebhookService
  ) {}

  async processQueue(getProjectMembers: (projectId: string) => Promise<UserInfo[]>): Promise<void> {
    this.logger.debug('Processing pending notifications');
    const grouped = await this.queueService.getGroupedByProjectAndType();
    this.logger.debug(`Grouped notifications: ${grouped.size}`);
    if (grouped.size === 0) {
      this.logger.debug('No pending notifications to process');
      return;
    }
    this.logger.debug(`Processing notifications for ${grouped.size} projects`);
    for (const [projectId, typeMap] of grouped) {
      for (const [notificationType, queueItems] of typeMap) {
        await this.processNotificationGroup(
          projectId,
          notificationType,
          queueItems,
          getProjectMembers
        );
      }
    }
  }

  private async processNotificationGroup(
    projectId: string,
    notificationType: NotificationType,
    queueItems: NotificationPendingQueue[],
    getProjectMembers: (projectId: string) => Promise<UserInfo[]>
  ): Promise<void> {
    const settings = await this.settingsService.findByProjectIdAndType(projectId, notificationType);

    if (!settings || !settings.enabled) {
      this.logger.debug(
        `Skipping ${notificationType} for project ${projectId}: notifications disabled`
      );
      await this.queueService.deleteProcessed(queueItems);
      return;
    }

    try {
      const projectMembers = await getProjectMembers(projectId);
      const validReceivers = this.getValidReceivers(settings, projectMembers);

      if (validReceivers.length === 0 && !settings.webhookUrl) {
        this.logger.debug(
          `Skipping ${notificationType} for project ${projectId}: no valid receivers`
        );
        await this.queueService.deleteProcessed(queueItems);
        return;
      }

      await this.queueService.lockItems(queueItems);

      const groupedByStatus = this.groupByRunStatus(queueItems);

      for (const [_status, items] of groupedByStatus) {
        for (const receiver of validReceivers) {
          this.logger.debug(`Sending ${notificationType} notification to ${receiver.email}`);
          try {
            await this.emailService.sendBatchedEmail(items, settings, receiver);
          } catch (error) {
            this.logger.error(
              `Email delivery failed for ${receiver.email} after retries: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        await this.webhookService.sendWebhooksForQueueItems(items, settings);
      }

      await this.queueService.deleteProcessed(queueItems);

      this.logger.log(
        `Processed ${queueItems.length} ${notificationType} notifications for project ${projectId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to process ${notificationType} for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`
      );
      this.logger.error(error);
    }
  }

  private getValidReceivers(
    settings: ProjectNotificationSettings,
    projectMembers: UserInfo[]
  ): UserInfo[] {
    const memberMap = new Map(projectMembers.map(m => [m.userId, m]));

    const validReceivers: UserInfo[] = [];
    for (const receiverId of settings.receivers) {
      const user = memberMap.get(receiverId);
      if (!user) {
        this.logger.debug(`Receiver ${receiverId} not found in project members`);
        continue;
      }
      if (!user.hasNotificationsEnabled) {
        this.logger.debug(`Skipping ${user.email}: notifications disabled in user preferences`);
        continue;
      }
      validReceivers.push(user);
    }

    return validReceivers;
  }

  private groupByRunStatus(
    queueItems: NotificationPendingQueue[]
  ): Map<string, NotificationPendingQueue[]> {
    const grouped = new Map<string, NotificationPendingQueue[]>();

    for (const item of queueItems) {
      const status = item.payload.runStatus ?? 'UNKNOWN';
      if (!grouped.has(status)) {
        grouped.set(status, []);
      }
      grouped.get(status)!.push(item);
    }

    return grouped;
  }
}
