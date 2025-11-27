import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import {
  DataDestinationConfig,
  DataDestinationConfigSchema,
} from '../data-destination-types/data-destination-config.type';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataDestination } from './data-destination.entity';
import { DataMart } from './data-mart.entity';

const REPORT_ID_NAMESPACE = '550e8400-e29b-41d4-a716-446655440000';

@Entity()
export class Report implements CreatorAwareEntity {
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

  /**
   * Version number for optimistic locking. This helps prevent concurrent modifications to the same report.
   */
  @VersionColumn()
  version: number;

  /**
   * Generates the report ID before inserting into the database.
   *
   * For Looker Studio destinations, generates a deterministic UUID v5 based on the combination
   * of DataMart ID and DataDestination ID. This ensures that the same DataMart + DataDestination
   * combination always produces the same report ID, allowing only one report per combination.
   *
   * For other destination types (Google Sheets), relies on TypeORM's @PrimaryGeneratedColumn
   * to automatically generate a random UUID, allowing multiple reports per combination.
   *
   * @returns {void}
   */
  @BeforeInsert()
  generateId(): void {
    if (this.dataDestination.type === DataDestinationType.LOOKER_STUDIO) {
      const name = `${this.dataMart.id}:${this.dataDestination.id}`;
      this.id = uuidv5(name, REPORT_ID_NAMESPACE);
      this.title = '';
    }
    // For other types, use automatic generation via @PrimaryGeneratedColumn
  }
}
