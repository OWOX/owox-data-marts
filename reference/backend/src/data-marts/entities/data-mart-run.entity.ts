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

@Entity()
export class DataMartRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DataMart)
  @JoinColumn()
  dataMart: DataMart;

  @Column()
  dataMartId: string;

  @Column({ type: 'json', nullable: true })
  definitionRun?: DataMartDefinition;

  @Column({ nullable: true })
  status?: DataMartRunStatus;

  @Column({ type: 'json', nullable: true })
  logs?: string[];

  @Column({ type: 'json', nullable: true })
  errors?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'json', nullable: true })
  additionalParams?: Record<string, unknown>;
}
