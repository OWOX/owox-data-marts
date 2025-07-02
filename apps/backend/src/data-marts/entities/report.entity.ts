import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataMart } from './data-mart.entity';
import { DataDestination } from './data-destination.entity';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import {
  DataDestinationConfig,
  DataDestinationConfigSchema,
} from '../data-destination-types/data-destination-config.type';

@Entity()
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => DataMart, { eager: true, cascade: true })
  @JoinColumn()
  dataMart: DataMart;

  @ManyToOne(() => DataDestination, { eager: true, cascade: true })
  @JoinColumn()
  dataDestination: DataDestination;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataDestinationConfig>(DataDestinationConfigSchema),
  })
  destinationConfig: DataDestinationConfig;

  @Column({ nullable: true })
  lastRunAt?: Date;

  @Column({ nullable: true })
  lastRunStatus?: ReportRunStatus;

  @Column({ nullable: true })
  lastRunError?: string;

  @Column({ default: 0 })
  runsCount: number;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
