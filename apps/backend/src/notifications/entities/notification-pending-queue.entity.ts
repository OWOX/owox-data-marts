import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Unique, Index } from 'typeorm';
import { NotificationType } from '../enums/notification-type.enum';
import {
  NotificationQueuePayload,
  NotificationQueuePayloadSchema,
} from '../types/notification-queue-payload.schema';
import { createZodTransformer } from '../../common/zod/zod-transformer';

@Entity('notification_pending_queue')
@Unique('uq_notification_pending_queue_type_project_dm_run', [
  'notificationType',
  'projectId',
  'dataMartId',
  'runId',
])
@Index('idx_notification_pending_queue_created', ['createdAt'])
@Index('idx_notification_pending_queue_project_type', ['projectId', 'notificationType'])
export class NotificationPendingQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  notificationType: NotificationType;

  @Column({ type: 'varchar' })
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  dataMartId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  runId?: string | null;

  @Column({
    type: 'json',
    default: {},
    transformer: createZodTransformer<NotificationQueuePayload>(NotificationQueuePayloadSchema),
  })
  payload: NotificationQueuePayload;

  @CreateDateColumn()
  createdAt: Date;
}
