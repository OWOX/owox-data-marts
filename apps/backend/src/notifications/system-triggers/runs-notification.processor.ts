import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronJob } from 'cron';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { DataMartRun } from '../../data-marts/entities/data-mart-run.entity';
import { NotificationQueueService } from '../services/notification-queue.service';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { NOTIFICATION_DEFINITIONS } from '../definitions';

@Injectable()
export class RunsNotificationProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(RunsNotificationProcessor.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly runRepository: Repository<DataMartRun>,
    private readonly queueService: NotificationQueueService,
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {
    super();
  }

  getType() {
    return SystemTriggerType.RUNS_NOTIFICATION;
  }

  getDefaultCron() {
    return '0 * * * * *'; // every minute
  }

  async process(trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      this.logger.debug('Runs notification processor aborted before start');
      return;
    }

    const now = new Date();
    await this.initializeSettingsForNewProjects(trigger.lastRunTimestamp ?? now);
    const dueSettings = await this.settingsService.findDueSettings(now);

    if (dueSettings.length === 0) {
      this.logger.debug('No due notification settings found');
      return;
    }

    this.logger.debug(`Processing ${dueSettings.length} due notification settings`);

    // Pre-fetch project titles for all unique projects
    const projectIds = [...new Set(dueSettings.map(s => s.projectId))];
    const projectProjections = await Promise.all(
      projectIds.map(pid => this.idpProjectionsFacade.getProjectProjection(pid))
    );
    const projectTitleMap = new Map(
      projectProjections.filter(Boolean).map(p => [p!.projectId, p!.projectTitle])
    );

    for (const setting of dueSettings) {
      if (options?.signal?.aborted) {
        this.logger.debug('Runs notification processor aborted during processing');
        return;
      }

      await this.processSetting(setting, now, projectTitleMap);
    }

    this.logger.log(`Processed ${dueSettings.length} notification settings`);
  }

  private async processSetting(
    setting: import('../entities/project-notification-settings.entity').ProjectNotificationSettings,
    now: Date,
    projectTitleMap: Map<string, string>
  ): Promise<void> {
    const definition = NOTIFICATION_DEFINITIONS[setting.notificationType];
    if (!definition) {
      this.logger.warn(`No definition found for notification type: ${setting.notificationType}`);
      return;
    }

    const intervalMs = this.getCronIntervalMs(setting.groupingDelayCron);
    const since = setting.lastRunAt ?? new Date(now.getTime() - intervalMs);
    const nextRunAt = new Date(now.getTime() + intervalMs);

    const items = await definition.collectQueueItems(setting.projectId, since, this.runRepository);

    if (items.length > 0) {
      const projectTitle = projectTitleMap.get(setting.projectId) ?? 'Unknown Project';
      this.logger.debug(
        `Adding ${items.length} ${setting.notificationType} items to queue for project ${setting.projectId}`
      );

      for (const item of items) {
        await this.queueService.addToQueue({
          notificationType: setting.notificationType,
          projectId: setting.projectId,
          dataMartId: item.dataMartId,
          runId: item.id,
          payload: definition.buildQueuePayload(item, projectTitle),
        });
      }
    }

    await this.settingsService.updateRunTimestamps(setting.id, now, nextRunAt);
  }

  private async initializeSettingsForNewProjects(since: Date): Promise<void> {
    const rows = await this.runRepository
      .createQueryBuilder('run')
      .innerJoin('run.dataMart', 'dm')
      .select('DISTINCT dm.projectId', 'projectId')
      .where('run.finishedAt >= :since', { since })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM project_notification_settings pns WHERE pns.projectId = dm.projectId)`
      )
      .getRawMany<{ projectId: string }>();

    for (const { projectId } of rows) {
      try {
        const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
        await this.settingsService.getOrCreateDefaultSettings(projectId, type =>
          NOTIFICATION_DEFINITIONS[type].getDefaultReceivers(members)
        );
      } catch (error) {
        this.logger.warn(
          `Failed to initialize notification settings for project ${projectId}`,
          error
        );
      }
    }
  }

  private getCronIntervalMs(cronExpression: string): number {
    const job = new CronJob(cronExpression, () => {});
    const dates = job.nextDates(2);
    return dates[1].toMillis() - dates[0].toMillis();
  }
}
