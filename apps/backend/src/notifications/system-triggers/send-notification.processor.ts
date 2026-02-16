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
   * Resolve profile data (email, name) for all configured receivers of a project.
   *
   * Reads only the user IDs explicitly listed in the project's notification settings,
   * not all project members. Profile data comes from the local UserProjection cache,
   * which was just refreshed from IDP by refreshUserProjections().
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

    const userProjections = await this.idpProjectionsFacade.getUserProjectionList(
      Array.from(allReceiverIds)
    );

    return userProjections.projections
      .filter(u => u.email)
      .map(u => ({
        userId: u.userId,
        email: u.email!,
        fullName: u.fullName ?? undefined,
      }));
  }
}
