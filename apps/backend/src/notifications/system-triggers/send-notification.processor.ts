import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { NotificationService } from '../services/notification.service';
import { NotificationQueueService } from '../services/notification-queue.service';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { UserInfo } from '../services/notification-email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SendNotificationProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(SendNotificationProcessor.name);

  private static readonly STALE_LOCK_TIMEOUT_MINUTES = 5;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly queueService: NotificationQueueService,
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly configService: ConfigService
  ) {
    super();
  }

  override isEnabled(): boolean {
    return this.configService.get<boolean>('NOTIFICATIONS_ENABLED') ?? false;
  }

  getType() {
    return SystemTriggerType.SEND_NOTIFICATIONS;
  }

  getDefaultCron() {
    return '0 * * * * *'; // every minute
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      this.logger.debug('Send notification processor aborted before start');
      return;
    }

    this.logger.debug('Processing pending notifications');

    // Reset items stuck in 'processing' from a previous crashed run
    await this.queueService.resetStaleProcessing(
      SendNotificationProcessor.STALE_LOCK_TIMEOUT_MINUTES
    );

    // getProjectMembers() already calls IDP and updates local UserProjection cache
    // for each project that has pending queue items — no separate bulk refresh needed.
    await this.notificationService.processQueue(async (projectId: string) =>
      this.getProjectMembers(projectId)
    );

    this.logger.debug('Send notification processor completed');
  }

  /**
   * Resolve profile data (email, name, notification preferences) for all configured
   * receivers of a project.
   *
   * Reads only the user IDs explicitly listed in the project's notification settings,
   * not all project members. Profile data comes from IDP and includes the user's
   * notification preference (hasNotificationsEnabled).
   */
  private async getProjectMembers(projectId: string): Promise<UserInfo[]> {
    this.logger.debug(`Getting project members for project ${projectId}`);

    const settings = await this.settingsService.findByProjectId(projectId);
    const allReceiverIds = new Set<string>();
    for (const s of settings) {
      for (const receiverId of s.receivers) {
        allReceiverIds.add(receiverId);
      }
    }

    this.logger.debug(`All receiver IDs: ${Array.from(allReceiverIds)}`);
    if (allReceiverIds.size === 0) {
      return [];
    }

    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
    const memberMap = new Map(members.map(m => [m.userId, m]));

    return Array.from(allReceiverIds)
      .map(userId => memberMap.get(userId))
      .filter((m): m is NonNullable<typeof m> => m !== undefined && !!m.email)
      .map(m => ({
        userId: m.userId,
        email: m.email,
        fullName: m.displayName ?? undefined,
        hasNotificationsEnabled: m.hasNotificationsEnabled,
      }));
  }
}
