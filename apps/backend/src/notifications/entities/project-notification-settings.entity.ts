import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { z } from 'zod';
import { NotificationType } from '../enums/notification-type.enum';
import { DEFAULT_GROUPING_DELAY_CRON } from '../enums/grouping-delay.enum';
import { createZodTransformer } from '../../common/zod/zod-transformer';

@Entity('project_notification_settings')
@Unique('uq_project_notification_settings_project_type', ['projectId', 'notificationType'])
@Index('idx_project_notification_settings_project', ['projectId'])
@Index('idx_project_notification_settings_next_run', ['enabled', 'nextRunAt'])
export class ProjectNotificationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  projectId: string;

  @Column({ type: 'varchar' })
  notificationType: NotificationType;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({
    type: 'json',
    default: [],
    transformer: createZodTransformer<string[]>(z.array(z.string())),
  })
  receivers: string[];

  @Column({ type: 'varchar', nullable: true })
  webhookUrl?: string | null;

  @Column({ type: 'varchar', default: DEFAULT_GROUPING_DELAY_CRON })
  groupingDelayCron: string;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  nextRunAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
