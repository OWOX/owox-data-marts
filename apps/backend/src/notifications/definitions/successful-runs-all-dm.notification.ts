import { NotificationType } from '../enums/notification-type.enum';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { BaseNotification, EmailContent } from '../types/base-notification';
import { NotificationQueuePayload } from '../types/notification-queue-payload.schema';
import { WebhookPayload } from '../types/notification-data.interface';
import { NotificationContext, NotificationRuntimeConfig } from '../types/notification-context';
import { Repository, MoreThan, In } from 'typeorm';
import { DataMartRun } from '../../data-marts/entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../data-marts/enums/data-mart-run-status.enum';
import {
  successfulRunEmailTemplate,
  successfulRunEmailSubjectSingle,
  successfulRunEmailSubjectBatch,
} from '../templates/email/successful-run.template';

export class SuccessfulRunsAllDmNotification extends BaseNotification {
  private static readonly MAX_DATA_MARTS = 20;
  private static readonly MAX_RUNS_PER_DM = 10;

  getType(): NotificationType {
    return NotificationType.SUCCESSFUL_RUNS_ALL_DM;
  }

  getDefaultEnabled(): boolean {
    return false;
  }

  async collectQueueItems(
    projectId: string,
    since: Date,
    runRepository: Repository<DataMartRun>
  ): Promise<DataMartRun[]> {
    return runRepository.find({
      where: {
        finishedAt: MoreThan(since),
        status: In([DataMartRunStatus.SUCCESS]),
        dataMart: { projectId },
      },
      relations: ['dataMart'],
    });
  }

  buildQueuePayload(item: DataMartRun, projectTitle: string): NotificationQueuePayload {
    return {
      dataMartTitle: item.dataMart.title,
      projectTitle,
      runStatus: 'SUCCESSFUL',
      dataMartRunType: item.type,
      creatorUserId: item.createdById,
      startedAt: item.startedAt?.toISOString(),
      finishedAt: item.finishedAt?.toISOString(),
      durationMs:
        item.startedAt && item.finishedAt
          ? item.finishedAt.getTime() - item.startedAt.getTime()
          : undefined,
    };
  }

  getEmailContent(
    queueItems: NotificationPendingQueue[],
    settings: ProjectNotificationSettings,
    runtimeConfig?: NotificationRuntimeConfig
  ): EmailContent {
    return this.buildEmailContent(
      queueItems,
      settings,
      {
        subjectSingle: successfulRunEmailSubjectSingle,
        subjectBatch: successfulRunEmailSubjectBatch,
        body: successfulRunEmailTemplate,
      },
      item => ({
        runId: item.runId ?? 'N/A',
        startedAt: this.formatDateTime(item.payload.startedAt),
        runTypeLabel: this.formatRunType(item.payload.dataMartRunType),
      }),
      undefined,
      runtimeConfig,
      {
        maxDataMarts: SuccessfulRunsAllDmNotification.MAX_DATA_MARTS,
        maxRunsPerDm: SuccessfulRunsAllDmNotification.MAX_RUNS_PER_DM,
      }
    );
  }

  getWebhookPayload(
    queueItem: NotificationPendingQueue,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload {
    return this.buildWebhookPayload(
      queueItem,
      'owox.data-marts.webhook.data_mart.run.successful',
      {
        id: queueItem.runId ?? '',
        status: 'SUCCESSFUL',
        type: queueItem.payload.dataMartRunType,
        startedAt: queueItem.payload.startedAt,
        finishedAt: queueItem.payload.finishedAt,
        durationMs: queueItem.payload.durationMs as number | undefined,
        rowsProcessed: queueItem.payload.rowsProcessed as number | undefined,
      },
      runtimeConfig
    );
  }

  getTestWebhookPayload(
    context: NotificationContext,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload {
    const now = new Date().toISOString();
    return this.buildTestWebhookPayload(
      'owox.data-marts.webhook.data_mart.run.successful',
      {
        id: 'test-run-id',
        status: 'SUCCESSFUL',
        type: 'CONNECTOR',
        startedAt: now,
        finishedAt: now,
        durationMs: 12345,
        rowsProcessed: 1000,
      },
      context,
      runtimeConfig
    );
  }
}
