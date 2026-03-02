import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { NotificationService } from '../services/notification.service';
import { NotificationQueueService } from '../services/notification-queue.service';
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
   * Resolve all project members from IDP. The full list is needed so that
   * NotificationService can both clean up stale receivers and filter by
   * notification preferences at send time.
   */
  private async getProjectMembers(projectId: string): Promise<UserInfo[]> {
    this.logger.debug(`Getting project members for project ${projectId}`);

    const members = await this.idpProjectionsFacade.getProjectMembers(projectId);

    return members
      .filter(m => !!m.email)
      .map(m => ({
        userId: m.userId,
        email: m.email,
        fullName: m.displayName ?? undefined,
        hasNotificationsEnabled: m.hasNotificationsEnabled,
      }));
  }
}
