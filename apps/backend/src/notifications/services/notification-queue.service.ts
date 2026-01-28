import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NotificationPendingQueue } from '../entities/notification-pending-queue.entity';
import { NotificationQueuePayload } from '../types/notification-queue-payload.schema';
import { NotificationType } from '../enums/notification-type.enum';

export interface AddToQueueParams {
  notificationType: NotificationType;
  projectId: string;
  dataMartId?: string | null;
  runId?: string | null;
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
    this.logger.debug(
      `Adding notification to queue: ${params.notificationType} for project ${params.projectId}`
    );
    try {
      const queueItem = this.repository.create({
        notificationType: params.notificationType,
        projectId: params.projectId,
        dataMartId: params.dataMartId,
        runId: params.runId,
        payload: params.payload,
      });

      return await this.repository.save(queueItem);
    } catch (error) {
      const msg = String(error);
      if (msg.includes('UNIQUE constraint failed') || msg.includes('Duplicate entry')) {
        this.logger.debug(
          `Duplicate notification ignored: ${params.notificationType} for project ${params.projectId}`
        );
        return null;
      }
      throw error;
    }
  }

  async getAll(): Promise<NotificationPendingQueue[]> {
    return this.repository.find({
      order: { createdAt: 'ASC' },
    });
  }

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
    const all = await this.getAll();
    const grouped = new Map<string, Map<NotificationType, NotificationPendingQueue[]>>();

    for (const item of all) {
      if (!grouped.has(item.projectId)) {
        grouped.set(item.projectId, new Map());
      }
      const projectMap = grouped.get(item.projectId)!;

      if (!projectMap.has(item.notificationType)) {
        projectMap.set(item.notificationType, []);
      }
      projectMap.get(item.notificationType)!.push(item);
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
}
