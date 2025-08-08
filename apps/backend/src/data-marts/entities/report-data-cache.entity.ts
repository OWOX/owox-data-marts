import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../data-storage-types/interfaces/data-storage-report-reader-state.interface';
import { Report } from './report.entity';

/**
 * Entity for storing persistent cache of report data readers
 */
@Entity()
export class ReportDataCache {
  /**
   * Primary key - auto-generated UUID
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Reference to the report
   */
  @ManyToOne(() => Report)
  @JoinColumn()
  report: Report;

  /**
   * Serialized report data description containing headers and metadata
   */
  @Column('json')
  dataDescription: ReportDataDescription;

  /**
   * Serialized reader state for restoration
   */
  @Column('json', { nullable: true })
  readerState: DataStorageReportReaderState | null;

  /**
   * Type of data storage for proper reader resolution
   */
  @Column()
  storageType: DataStorageType;

  /**
   * When the cache entry was created
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * When the cache entry expires and should be cleaned up
   */
  @Column()
  expiresAt: Date;
}
