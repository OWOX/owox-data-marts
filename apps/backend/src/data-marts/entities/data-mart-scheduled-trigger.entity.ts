import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { ScheduledTrigger } from '../../common/scheduler/shared/entities/scheduled-trigger.entity';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { DataMart } from './data-mart.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import {
  ScheduledTriggerConfig,
  ScheduledTriggerConfigSchema,
} from '../scheduled-trigger-types/scheduled-trigger-config.type';

/**
 * Entity representing a scheduled trigger for a data mart
 */
@Entity()
export class DataMartScheduledTrigger extends ScheduledTrigger {
  @Column()
  type: ScheduledTriggerType;

  @ManyToOne(() => DataMart, { eager: true })
  @JoinColumn()
  dataMart: DataMart;

  @RelationId((trigger: DataMartScheduledTrigger) => trigger.dataMart)
  dataMartId: string;

  @Column({
    type: 'json',
    transformer: createZodTransformer<ScheduledTriggerConfig>(ScheduledTriggerConfigSchema, false),
    nullable: true,
  })
  triggerConfig?: ScheduledTriggerConfig;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
