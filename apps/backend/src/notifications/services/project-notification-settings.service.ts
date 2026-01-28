import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { CronJob } from 'cron';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NotificationType } from '../enums/notification-type.enum';
import { DEFAULT_GROUPING_DELAY_CRON } from '../enums/grouping-delay.enum';
import { NOTIFICATION_DEFAULT_ENABLED } from '../enums/notification-type.enum';

@Injectable()
export class ProjectNotificationSettingsService {
  private readonly logger = new Logger(ProjectNotificationSettingsService.name);

  constructor(
    @InjectRepository(ProjectNotificationSettings)
    private readonly repository: Repository<ProjectNotificationSettings>
  ) {}

  async findByProjectId(projectId: string): Promise<ProjectNotificationSettings[]> {
    return this.repository.find({ where: { projectId } });
  }

  async findByProjectIdAndType(
    projectId: string,
    notificationType: NotificationType
  ): Promise<ProjectNotificationSettings | null> {
    return this.repository.findOne({ where: { projectId, notificationType } });
  }

  async findEnabledByType(
    notificationType: NotificationType
  ): Promise<ProjectNotificationSettings[]> {
    return this.repository.find({ where: { notificationType, enabled: true } });
  }

  async findAllActive(): Promise<ProjectNotificationSettings[]> {
    return this.repository.find({ where: { enabled: true } });
  }

  /**
   * Find enabled settings where the grouping window has elapsed:
   * - lastRunAt IS NULL (never processed), OR
   * - nextRunAt <= now (window has elapsed)
   */
  async findDueSettings(now: Date): Promise<ProjectNotificationSettings[]> {
    return this.repository.find({
      where: [
        { enabled: true, lastRunAt: IsNull() },
        { enabled: true, nextRunAt: LessThanOrEqual(now) },
      ],
    });
  }

  async updateRunTimestamps(id: string, lastRunAt: Date, nextRunAt: Date): Promise<void> {
    await this.repository.update(id, { lastRunAt, nextRunAt });
  }

  async upsert(
    projectId: string,
    notificationType: NotificationType,
    data: Partial<
      Pick<
        ProjectNotificationSettings,
        'enabled' | 'receivers' | 'webhookUrl' | 'groupingDelayCron'
      >
    >
  ): Promise<ProjectNotificationSettings> {
    let settings = await this.findByProjectIdAndType(projectId, notificationType);

    if (!settings) {
      const cron = data.groupingDelayCron ?? DEFAULT_GROUPING_DELAY_CRON;
      const beingEnabled = data.enabled === true;
      settings = this.repository.create({
        projectId,
        notificationType,
        enabled: data.enabled ?? false,
        receivers: data.receivers ?? [],
        webhookUrl: data.webhookUrl ?? null,
        groupingDelayCron: cron,
        lastRunAt: beingEnabled ? new Date() : null,
        nextRunAt: beingEnabled ? this.calculateNextRunTime(cron) : null,
      });
    } else {
      const wasDisabled = !settings.enabled;
      const beingEnabled = data.enabled === true && wasDisabled;

      if (data.enabled !== undefined) settings.enabled = data.enabled;
      if (data.receivers !== undefined) settings.receivers = data.receivers;
      if (data.webhookUrl !== undefined) settings.webhookUrl = data.webhookUrl;

      const cronChanged =
        data.groupingDelayCron !== undefined &&
        data.groupingDelayCron !== settings.groupingDelayCron;
      if (data.groupingDelayCron !== undefined) settings.groupingDelayCron = data.groupingDelayCron;

      if (beingEnabled) {
        settings.lastRunAt = new Date();
        settings.nextRunAt = this.calculateNextRunTime(settings.groupingDelayCron);
      } else if (cronChanged && settings.enabled && settings.nextRunAt) {
        settings.nextRunAt = this.calculateNextRunTime(
          settings.groupingDelayCron,
          settings.lastRunAt ?? undefined
        );
      }
    }

    return this.repository.save(settings);
  }

  private calculateNextRunTime(cronExpression: string, fromDate: Date = new Date()): Date {
    const job = new CronJob(cronExpression, () => {});
    const dates = job.nextDates(2);
    const intervalMs = dates[1].toMillis() - dates[0].toMillis();
    return new Date(fromDate.getTime() + intervalMs);
  }

  async getOrCreateDefaultSettings(
    projectId: string,
    resolveDefaultReceivers?: (type: NotificationType) => string[]
  ): Promise<ProjectNotificationSettings[]> {
    const existing = await this.findByProjectId(projectId);

    const allTypes = Object.values(NotificationType);
    const existingTypes = new Set(existing.map(s => s.notificationType));
    const missingTypes = allTypes.filter(t => !existingTypes.has(t));

    if (missingTypes.length === 0) {
      return existing;
    }

    const now = new Date();
    const newSettings = missingTypes.map(notificationType => {
      const defaultEnabled = NOTIFICATION_DEFAULT_ENABLED[notificationType];
      const receivers = resolveDefaultReceivers ? resolveDefaultReceivers(notificationType) : [];
      return this.repository.create({
        projectId,
        notificationType,
        enabled: defaultEnabled,
        receivers,
        webhookUrl: null,
        groupingDelayCron: DEFAULT_GROUPING_DELAY_CRON,
        lastRunAt: defaultEnabled ? now : null,
        nextRunAt: defaultEnabled ? this.calculateNextRunTime(DEFAULT_GROUPING_DELAY_CRON) : null,
      });
    });

    const saved = await this.repository.save(newSettings);
    return [...existing, ...saved];
  }
}
