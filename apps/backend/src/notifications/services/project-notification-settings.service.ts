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
        optedOutReceivers: [],
        webhookUrl: data.webhookUrl ?? null,
        groupingDelayCron: cron,
        lastRunAt: beingEnabled ? new Date() : null,
        nextRunAt: beingEnabled ? this.calculateNextRunTime(cron) : null,
      });
    } else {
      const wasDisabled = !settings.enabled;
      const beingEnabled = data.enabled === true && wasDisabled;

      if (data.enabled !== undefined) settings.enabled = data.enabled;
      if (data.receivers !== undefined) {
        const oldReceivers = new Set(settings.receivers);
        const newReceivers = new Set(data.receivers);
        const removed = [...oldReceivers].filter(id => !newReceivers.has(id));
        const added = [...newReceivers].filter(id => !oldReceivers.has(id));

        // Initialize optedOutReceivers on first manual edit (legacy rows have null)
        const optedOut = new Set(settings.optedOutReceivers ?? []);
        for (const id of removed) optedOut.add(id);
        for (const id of added) optedOut.delete(id);
        settings.optedOutReceivers = [...optedOut];

        settings.receivers = data.receivers;
      }
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

  async updateReceivers(id: string, receivers: string[]): Promise<void> {
    await this.repository.update(id, { receivers });
  }

  /**
   * Synchronize receivers with the current project member list:
   * - Remove receivers who left the project or whose role downgraded to viewer
   * - Auto-subscribe eligible (admin/editor) members who haven't manually opted out
   * - Respect manual unsubscriptions tracked in optedOutReceivers
   * - Clean optedOutReceivers of users who left the project, so that if they return
   *   they are treated as new and auto-subscribed again
   */
  async syncReceivers(
    settings: ProjectNotificationSettings,
    members: { userId: string; role: string }[]
  ): Promise<void> {
    if (members.length === 0) return; // IDP failure guard — don't touch receivers

    const memberIds = new Set(members.map(m => m.userId));
    const eligibleIds = new Set(
      members.filter(m => m.role === 'admin' || m.role === 'editor').map(m => m.userId)
    );

    // Legacy mode: optedOutReceivers is null (migrated row, never manually edited).
    // Only remove receivers who left or lost eligibility — do NOT auto-subscribe anyone.
    // Auto-subscription activates after the first manual edit via upsert().
    const isLegacy = settings.optedOutReceivers === null;

    // Retain only receivers who are still project members AND still eligible
    const retainedReceivers = settings.receivers.filter(
      id => memberIds.has(id) && eligibleIds.has(id)
    );

    let updatedReceivers: string[];
    let updatedOptedOut: string[] | null;

    if (isLegacy) {
      updatedReceivers = retainedReceivers;
      updatedOptedOut = null; // keep null until first manual edit
    } else {
      // Clean optedOutReceivers: remove users who left the project so that
      // re-joining is treated as a fresh start (auto-subscribe again).
      const activeOptedOut = new Set(settings.optedOutReceivers!.filter(id => memberIds.has(id)));

      // Auto-subscribe eligible members who haven't manually opted out
      const newEligible = [...eligibleIds].filter(
        id => !settings.receivers.includes(id) && !activeOptedOut.has(id)
      );

      updatedReceivers = [...retainedReceivers, ...newEligible];
      updatedOptedOut = [...activeOptedOut];
    }

    const sortedUpdated = [...updatedReceivers].sort();
    const sortedCurrent = [...settings.receivers].sort();
    const receiversChanged = JSON.stringify(sortedUpdated) !== JSON.stringify(sortedCurrent);

    const optedOutChanged = isLegacy
      ? false
      : JSON.stringify([...(updatedOptedOut ?? [])].sort()) !==
        JSON.stringify([...(settings.optedOutReceivers ?? [])].sort());

    if (receiversChanged || optedOutChanged) {
      settings.receivers = updatedReceivers;
      settings.optedOutReceivers = updatedOptedOut;
      await this.repository.update(settings.id, {
        ...(receiversChanged ? { receivers: updatedReceivers } : {}),
        ...(optedOutChanged ? { optedOutReceivers: updatedOptedOut } : {}),
      });
    }
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
        optedOutReceivers: [],
        webhookUrl: null,
        groupingDelayCron: DEFAULT_GROUPING_DELAY_CRON,
        lastRunAt: defaultEnabled ? now : null,
        nextRunAt: defaultEnabled ? this.calculateNextRunTime(DEFAULT_GROUPING_DELAY_CRON) : null,
      });
    });

    try {
      const saved = await this.repository.save(newSettings);
      return [...existing, ...saved];
    } catch (error) {
      const msg = String(error);
      if (msg.includes('UNIQUE constraint failed') || msg.includes('Duplicate entry')) {
        // Race condition: another process initialized settings concurrently — re-fetch
        return this.findByProjectId(projectId);
      }
      throw error;
    }
  }
}
