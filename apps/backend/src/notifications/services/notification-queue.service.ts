import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { NotificationQueuePayload } from '../types/notification-queue-payload.schema';
import { NotificationType } from '../enums/notification-type.enum';
import { QueueStatus } from '../enums/queue-status.enum';

export interface AddToQueueParams {
  notificationType: NotificationType;
  projectId: string;
  dataMartId?: string;
  runId?: string;
  payload: NotificationQueuePayload;
}

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    @InjectRepository(NotificationPendingQueue)
    private readonly repository: Repository<NotificationPendingQueue>
  ) {}

  async addToQueue(params: AddToQueueParams): Promise<NotificationPendingQueue | null> {
    this.logger.log(
      `Adding notification to queue: ${params.notificationType} for project ${params.projectId}`
    );
    try {
      const queueItem = this.repository.create({
        notificationType: params.notificationType,
        projectId: params.projectId,
        dataMartId: params.dataMartId ?? '',
        runId: params.runId ?? '',
        payload: params.payload,
      });

      return await this.repository.save(queueItem);
    } catch (error) {
      const msg = String(error);
      if (msg.includes('UNIQUE constraint failed') || msg.includes('Duplicate entry')) {
        this.logger.warn(
          `Duplicate notification ignored: ${params.notificationType} for project ${params.projectId}`
        );
        return null;
      }
      throw error;
    }
  }

  private static readonly PAGE_SIZE = 500;

  async getByProjectAndType(
    projectId: string,
    notificationType: NotificationType
  ): Promise<NotificationPendingQueue[]> {
    return this.repository.find({
      where: { projectId, notificationType },
      order: { createdAt: 'ASC' },
    });
  }

  async getGroupedByProjectAndType(): Promise<
    Map<string, Map<NotificationType, NotificationPendingQueue[]>>
  > {
    const grouped = new Map<string, Map<NotificationType, NotificationPendingQueue[]>>();
    let skip = 0;

    while (true) {
      const page = await this.repository.find({
        where: { status: QueueStatus.PENDING },
        order: { createdAt: 'ASC' },
        take: NotificationQueueService.PAGE_SIZE,
        skip,
      });

      for (const item of page) {
        if (!grouped.has(item.projectId)) {
          grouped.set(item.projectId, new Map());
        }
        const projectMap = grouped.get(item.projectId)!;

        if (!projectMap.has(item.notificationType)) {
          projectMap.set(item.notificationType, []);
        }
        projectMap.get(item.notificationType)!.push(item);
      }

      if (page.length < NotificationQueueService.PAGE_SIZE) break;
      skip += NotificationQueueService.PAGE_SIZE;
    }

    return grouped;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repository.delete({ id: In(ids) });
  }

  async deleteProcessed(items: NotificationPendingQueue[]): Promise<void> {
    const ids = items.map(i => i.id);
    await this.deleteByIds(ids);
  }

  async lockItems(items: NotificationPendingQueue[]): Promise<void> {
    const ids = items.map(i => i.id);
    if (ids.length === 0) return;
    await this.repository.update(
      { id: In(ids) },
      { status: QueueStatus.PROCESSING, lockedAt: new Date() }
    );
  }

  async unlockItems(items: NotificationPendingQueue[]): Promise<void> {
    const ids = items.map(i => i.id);
    if (ids.length === 0) return;
    await this.repository
      .createQueryBuilder()
      .update(NotificationPendingQueue)
      .set({
        status: QueueStatus.PENDING,
        lockedAt: null,
        attemptCount: () => 'attemptCount + 1',
      })
      .whereInIds(ids)
      .execute();
  }

  async resetStaleProcessing(timeoutMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const result = await this.repository.update(
      { status: QueueStatus.PROCESSING, lockedAt: LessThan(cutoff) },
      { status: QueueStatus.PENDING, lockedAt: null }
    );
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.warn(`Reset ${affected} stale processing items (locked > ${timeoutMinutes}min)`);
    }
    return affected;
  }
}
