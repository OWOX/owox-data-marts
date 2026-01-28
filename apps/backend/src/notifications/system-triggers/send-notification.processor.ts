import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { NotificationService } from '../services/notification.service';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { UserInfo } from '../services/notification-email.service';

@Injectable()
export class SendNotificationProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(SendNotificationProcessor.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {
    super();
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

    // Refresh user projections before validating receivers
    await this.refreshUserProjections();

    await this.notificationService.processQueue(async (projectId: string) =>
      this.getProjectMembers(projectId)
    );

    this.logger.debug('Send notification processor completed');
  }

  /**
   * Refresh user projections for all projects with active notification settings.
   * This ensures we have up-to-date user information before sending notifications.
   */
  private async refreshUserProjections(): Promise<void> {
    try {
      this.logger.debug('Refreshing user projections from IDP');

      // Get all projects with active notification settings
      const allSettings = await this.settingsService.findAllActive();
      const projectIds = [...new Set(allSettings.map(s => s.projectId))];

      this.logger.debug(`Refreshing projections for ${projectIds.length} projects`);

      // Refresh projections for all projects in parallel
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
      // Don't throw - continue with cached projections
    }
  }

  /**
   * Get project members from UserProjection table.
   *
   * This uses cached user projections from the database.
   * Users are added to projections when they authenticate.
   *
   * For MVP: All users in UserProjection are considered project members
   * (single organization model).
   */
  private async getProjectMembers(projectId: string): Promise<UserInfo[]> {
    this.logger.debug(`Getting project members for project ${projectId}`);

    // Get all receiver IDs from project settings
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

    // Get user projections for these receivers
    const userProjections = await this.idpProjectionsFacade.getUserProjectionList(
      Array.from(allReceiverIds)
    );

    // Convert to UserInfo format, filtering out users without email
    return userProjections.projections
      .filter(u => u.email)
      .map(u => ({
        userId: u.userId,
        email: u.email!,
        fullName: u.fullName ?? undefined,
      }));
  }
}
