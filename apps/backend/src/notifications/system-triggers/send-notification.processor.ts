import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { NotificationService } from '../services/notification.service';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { UserInfo } from '../services/notification-email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SendNotificationProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(SendNotificationProcessor.name);

  constructor(
    private readonly notificationService: NotificationService,
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

    // Pull fresh member data from IDP into the local UserProjection cache before
    // resolving receiver profiles, so emails/names are always up-to-date.
    await this.refreshUserProjections();

    await this.notificationService.processQueue(async (projectId: string) =>
      this.getProjectMembers(projectId)
    );

    this.logger.debug('Send notification processor completed');
  }

  /**
   * Call IDP for every project that has active notification settings and sync the
   * response into the local UserProjection cache. Failures per-project are logged
   * and skipped so one unavailable project does not block the others.
   */
  private async refreshUserProjections(): Promise<void> {
    try {
      this.logger.debug('Refreshing user projections from IDP');

      const allSettings = await this.settingsService.findAllActive();
      const projectIds = [...new Set(allSettings.map(s => s.projectId))];

      this.logger.debug(`Refreshing projections for ${projectIds.length} projects`);

      await Promise.allSettled(
        projectIds.map(async projectId => {
          try {
            await this.idpProjectionsFacade.getProjectMembers(projectId);
          } catch (error) {
            this.logger.warn(`Failed to refresh projections for project ${projectId}`, error);
          }
        })
      );

      this.logger.debug('User projections refresh completed');
    } catch (error) {
      this.logger.error('Failed to refresh user projections', error);
    }
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
