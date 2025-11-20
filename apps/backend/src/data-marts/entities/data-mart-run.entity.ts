import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { DataMart } from './data-mart.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunReportDefinition } from '../dto/schemas/data-mart-run/data-mart-run-report-definition.schema';

@Entity()
export class DataMartRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DataMart)
  @JoinColumn()
  dataMart: DataMart;

  @Column()
  dataMartId: string;

  @Column()
  type: DataMartRunType;

  @Column({ type: 'json' })
  definitionRun: DataMartDefinition;

  @Column({ nullable: true })
  insightId?: string;

  @Column({ type: 'varchar', nullable: true })
  reportId?: string | null;

  @Column({ type: 'json', nullable: true })
  reportDefinition?: DataMartRunReportDefinition | null;

  @Column()
  status: DataMartRunStatus;

  @Column({ nullable: true })
  createdById?: string;

  @Column()
  runType: RunType;

  @Column({ type: 'json', nullable: true })
  logs?: string[] | null;

  @Column({ type: 'json', nullable: true })
  errors?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'json', nullable: true })
  additionalParams?: Record<string, unknown> | null;
}
