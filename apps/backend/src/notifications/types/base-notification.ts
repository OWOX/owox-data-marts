import Handlebars from 'handlebars';
import { randomUUID } from 'crypto';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import { NotificationType } from '../enums/notification-type.enum';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { WebhookPayload, WebhookRun } from './notification-data.interface';
import { NotificationQueuePayload } from './notification-queue-payload.schema';
import { DataMartRun } from '../../data-marts/entities/data-mart-run.entity';
import {
  NotificationContext,
  NotificationEmailLimits,
  NotificationRuntimeConfig,
} from './notification-context';
import { RUN_TYPE_ICONS } from '../templates/email/assets/img';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';

export interface EmailContent {
  subject: string;
  bodyHtml: string;
}

export interface MemberRef {
  userId: string;
  role: string;
}

export abstract class BaseNotification {
  abstract getType(): NotificationType;

  abstract getDefaultEnabled(): boolean;

  abstract collectQueueItems(
    projectId: string,
    since: Date,
    runRepository: Repository<DataMartRun>
  ): Promise<DataMartRun[]>;

  abstract buildQueuePayload(item: DataMartRun, projectTitle: string): NotificationQueuePayload;

  getAvailableFilters(): string[] {
    return [];
  }

  abstract getEmailContent(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings,
    runtimeConfig?: NotificationRuntimeConfig
  ): EmailContent;

  abstract getWebhookPayload(
    queueItem: NotificationPendingQueue,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload;

  abstract getTestWebhookPayload(
    context: NotificationContext,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload;

  shouldNotify(settings: ProjectNotificationSettings, _runStatus?: string): boolean {
    return settings.enabled;
  }

  getDefaultReceivers(members: MemberRef[]): string[] {
    return members.filter(m => m.role === 'admin' || m.role === 'editor').map(m => m.userId);
  }

  protected buildWebhookPayload(
    queueItem: NotificationPendingQueue,
    event: string,
    run: WebhookRun,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload {
    return {
      id: randomUUID(),
      version: '1',
      event,
      timestamp: new Date().toISOString(),
      data: {
        projectId: queueItem.projectId,
        projectTitle: queueItem.payload.projectTitle,
        dataMart: {
          id: queueItem.dataMartId ?? '',
          title: queueItem.payload.dataMartTitle ?? '',
          url: this.buildDataMartUrl(queueItem, runtimeConfig),
        },
        run,
      },
    };
  }

  protected buildTestWebhookPayload(
    event: string,
    run: WebhookRun,
    context: NotificationContext,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload {
    const baseUrl = runtimeConfig?.appUrl ?? '';
    const testDataMartId = 'test-data-mart-id';
    return {
      id: randomUUID(),
      version: '1',
      event,
      timestamp: new Date().toISOString(),
      isTest: true,
      data: {
        projectId: context.projectId,
        projectTitle: context.projectTitle ?? 'Test Project',
        dataMart: {
          id: testDataMartId,
          title: 'Test Data Mart',
          url: `${baseUrl}/ui/${context.projectId}/data-marts/${testDataMartId}`,
        },
        run,
      },
    };
  }

  protected buildEmailContent(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings,
    templates: { subjectSingle: string; subjectBatch: string; body: string },
    buildRunData: (item: NotificationPendingQueue) => object,
    actualWindowMs?: number,
    runtimeConfig?: NotificationRuntimeConfig,
    limits?: NotificationEmailLimits
  ): EmailContent {
    const isBatch = queueItems.length > 1;
    const firstItem = queueItems[0];

    const dataMartMap = new Map<
      string,
      { dataMartTitle: string; dataMartUrl: string; dataMartRunHistoryUrl: string; runs: object[] }
    >();

    for (const item of queueItems) {
      const dataMartId = item.dataMartId ?? 'N/A';
      const dataMartTitle = item.payload.dataMartTitle ?? '<title>';
      const dataMartUrl = this.buildDataMartUrl(item, runtimeConfig);
      const dataMartRunHistoryUrl = this.buildDataMartRunHistoryUrl(
        item.projectId,
        dataMartId,
        runtimeConfig
      );

      if (!dataMartMap.has(dataMartId)) {
        dataMartMap.set(dataMartId, {
          dataMartTitle,
          dataMartUrl,
          dataMartRunHistoryUrl,
          runs: [],
        });
      }

      dataMartMap.get(dataMartId)!.runs.push(buildRunData(item));
    }

    const allDataMarts = Array.from(dataMartMap.values()).map(dm => {
      const hidden =
        limits?.maxRunsPerDm !== undefined && dm.runs.length > limits.maxRunsPerDm
          ? dm.runs.length - limits.maxRunsPerDm
          : 0;
      return {
        ...dm,
        runs: limits?.maxRunsPerDm !== undefined ? dm.runs.slice(0, limits.maxRunsPerDm) : dm.runs,
        hiddenRunsLabel: hidden > 0 ? `${hidden} more run${hidden !== 1 ? 's' : ''}` : undefined,
      };
    });

    const hiddenDmCount =
      limits?.maxDataMarts !== undefined && allDataMarts.length > limits.maxDataMarts
        ? allDataMarts.length - limits.maxDataMarts
        : 0;

    const dataMarts =
      limits?.maxDataMarts !== undefined
        ? allDataMarts.slice(0, limits.maxDataMarts)
        : allDataMarts;

    const baseUrl = runtimeConfig?.appUrl ?? '';
    const projectId = firstItem.projectId;

    const templateData = {
      projectTitle: firstItem.payload.projectTitle ?? 'Unknown Project',
      projectUrl: `${baseUrl}/ui/${projectId}`,
      projectNotificationsUrl: `${baseUrl}/ui/${projectId}/notifications`,
      groupingWindowLabel: this.getGroupingWindowLabel(settings.groupingDelayCron, actualWindowMs),
      dataMarts,
      hiddenDataMartsLabel:
        hiddenDmCount > 0
          ? `${hiddenDmCount} more data mart${hiddenDmCount !== 1 ? 's' : ''}`
          : undefined,
      dataMartListUrl: this.buildProjectDataMartsUrl(firstItem, runtimeConfig),
    };

    const bodyHtml = Handlebars.compile(templates.body)(templateData);
    const subject = Handlebars.compile(isBatch ? templates.subjectBatch : templates.subjectSingle)({
      dataMartTitle: dataMarts[0]?.dataMartTitle,
      count: queueItems.length,
      projectTitle: templateData.projectTitle,
    });

    return { subject, bodyHtml };
  }

  protected buildDataMartUrl(
    queueItem: NotificationPendingQueue,
    runtimeConfig?: NotificationRuntimeConfig
  ): string {
    const baseUrl = runtimeConfig?.appUrl ?? '';
    return buildDataMartUrl(baseUrl, queueItem.projectId, queueItem.dataMartId);
  }

  protected buildProjectDataMartsUrl(
    queueItem: NotificationPendingQueue,
    runtimeConfig?: NotificationRuntimeConfig
  ): string {
    const baseUrl = runtimeConfig?.appUrl ?? '';
    return buildDataMartUrl(baseUrl, queueItem.projectId);
  }

  protected buildDataMartRunHistoryUrl(
    projectId: string,
    dataMartId: string,
    runtimeConfig?: NotificationRuntimeConfig
  ): string {
    const baseUrl = runtimeConfig?.appUrl ?? '';
    return buildDataMartUrl(baseUrl, projectId, dataMartId, '/run-history');
  }

  protected formatRunType(type?: string): string | undefined {
    if (!type) return undefined;
    const labels: Record<string, string> = {
      CONNECTOR: 'Connector run',
      GOOGLE_SHEETS_EXPORT: 'Google Sheets report run',
      LOOKER_STUDIO: 'Looker Studio run',
      EMAIL: 'Email delivery',
      SLACK: 'Slack delivery',
      MS_TEAMS: 'MS Teams delivery',
      GOOGLE_CHAT: 'Google Chat delivery',
      INSIGHT: 'Insight run',
    };
    return labels[type] ?? type;
  }

  protected formatTriggerLabel(runType?: string): string | undefined {
    if (!runType) return undefined;
    return runType === 'scheduled' ? 'Scheduled' : runType === 'manual' ? 'Manual' : undefined;
  }

  protected getRunTypeIconSvg(dataMartRunType?: string): string | undefined {
    if (!dataMartRunType) return undefined;
    return RUN_TYPE_ICONS[dataMartRunType];
  }

  protected formatDateTime(isoString?: string): string {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      });
    } catch {
      return isoString;
    }
  }

  protected getGroupingWindowLabel(cronExpression: string, actualWindowMs?: number): string {
    try {
      const ms =
        actualWindowMs ??
        (() => {
          const dates = CronJob.from({ cronTime: cronExpression, onTick: () => {} }).nextDates(2);
          return dates[1].toMillis() - dates[0].toMillis();
        })();
      const minutes = Math.round(ms / 60_000);
      if (minutes < 60) return `last ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `last ${hours} hour${hours !== 1 ? 's' : ''}`;
      const days = Math.round(hours / 24);
      return `last ${days} day${days !== 1 ? 's' : ''}`;
    } catch {
      return 'recent period';
    }
  }
}
