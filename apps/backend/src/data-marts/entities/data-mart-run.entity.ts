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
import { DataMartRunType } from 'src/data-marts/enums/data-mart-run-type.enum';
import { DataMartRunReportDefinition } from 'src/data-marts/dto/schemas/data-mart-run/data-mart-run-report-definition.schema';

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

  @Column({ type: 'json', nullable: true })
  definitionRun?: DataMartDefinition;

  @Column()
  reportId: string;

  @Column({ type: 'json', nullable: true })
  reportDefinition?: DataMartRunReportDefinition;

  @Column({ nullable: true })
  status?: DataMartRunStatus;

  @Column({ nullable: true })
  createdById?: string;

  @Column({ nullable: true })
  runType?: RunType;

  @Column({ type: 'json', nullable: true })
  logs?: string[];

  @Column({ type: 'json', nullable: true })
  errors?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date;

  @Column({ type: 'json', nullable: true })
  additionalParams?: Record<string, unknown>;
}
