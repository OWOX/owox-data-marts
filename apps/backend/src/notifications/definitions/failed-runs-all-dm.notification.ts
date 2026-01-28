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
  failedRunEmailTemplate,
  failedRunEmailSubjectSingle,
  failedRunEmailSubjectBatch,
} from '../templates/email/failed-run.template';

function extractErrorMessage(errorStr: string): string {
  try {
    const parsed = JSON.parse(errorStr) as Record<string, unknown>;
    const msg = parsed['error'] ?? parsed['message'] ?? parsed['msg'];
    return typeof msg === 'string' ? msg : errorStr;
  } catch {
    return errorStr;
  }
}

export class FailedRunsAllDmNotification extends BaseNotification {
  private static readonly MAX_DATA_MARTS = 20;
  private static readonly MAX_RUNS_PER_DM = 10;
  private static readonly MAX_ERRORS_PER_RUN = 3;
  private static readonly MAX_ERROR_LENGTH = 300;

  getType(): NotificationType {
    return NotificationType.FAILED_RUNS_ALL_DM;
  }

  getDefaultEnabled(): boolean {
    return true;
  }

  async collectQueueItems(
    projectId: string,
    since: Date,
    runRepository: Repository<DataMartRun>
  ): Promise<DataMartRun[]> {
    return runRepository.find({
      where: {
        finishedAt: MoreThan(since),
        status: In([DataMartRunStatus.FAILED]),
        dataMart: { projectId },
      },
      relations: ['dataMart'],
    });
  }

  buildQueuePayload(item: DataMartRun, projectTitle: string): NotificationQueuePayload {
    return {
      dataMartTitle: item.dataMart.title,
      projectTitle,
      runStatus: 'FAILED',
      dataMartRunType: item.type,
      errors: item.errors ?? undefined,
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
        subjectSingle: failedRunEmailSubjectSingle,
        subjectBatch: failedRunEmailSubjectBatch,
        body: failedRunEmailTemplate,
      },
      item => {
        const allErrors = item.payload.errors ?? [];
        return {
          runId: item.runId ?? 'N/A',
          startedAt: this.formatDateTime(item.payload.startedAt ?? item.payload.finishedAt),
          runTypeLabel: this.formatRunType(item.payload.dataMartRunType),
          errors:
            allErrors.length > 0
              ? allErrors.slice(0, FailedRunsAllDmNotification.MAX_ERRORS_PER_RUN).map(e => {
                  const msg = extractErrorMessage(String(e));
                  return msg.length > FailedRunsAllDmNotification.MAX_ERROR_LENGTH
                    ? {
                        message: msg.slice(0, FailedRunsAllDmNotification.MAX_ERROR_LENGTH),
                        hasMore: true,
                      }
                    : { message: msg, hasMore: false };
                })
              : undefined,
        };
      },
      undefined,
      runtimeConfig,
      {
        maxDataMarts: FailedRunsAllDmNotification.MAX_DATA_MARTS,
        maxRunsPerDm: FailedRunsAllDmNotification.MAX_RUNS_PER_DM,
      }
    );
  }

  getWebhookPayload(
    queueItem: NotificationPendingQueue,
    runtimeConfig?: NotificationRuntimeConfig
  ): WebhookPayload {
    return this.buildWebhookPayload(
      queueItem,
      'owox.data-marts.webhook.data_mart.run.failed',
      {
        id: queueItem.runId ?? '',
        status: 'FAILED',
        type: queueItem.payload.dataMartRunType,
        startedAt: queueItem.payload.startedAt,
        finishedAt: queueItem.payload.finishedAt,
        errors: queueItem.payload.errors as string[] | undefined,
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
      'owox.data-marts.webhook.data_mart.run.failed',
      {
        id: 'test-run-id',
        status: 'FAILED',
        type: 'CONNECTOR',
        startedAt: now,
        finishedAt: now,
        errors: ['Test error: connection timeout'],
      },
      context,
      runtimeConfig
    );
  }
}
