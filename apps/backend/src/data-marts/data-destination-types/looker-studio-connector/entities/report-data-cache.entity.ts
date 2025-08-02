import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { ReaderState } from '../interfaces/reader-state.interface';

/**
 * Entity for storing persistent cache of report data readers
 */
@Entity()
export class ReportDataCache {
  /**
   * Primary key - uses report ID directly
   */
  @PrimaryColumn()
  id: string;

  /**
   * Serialized report data description containing headers and metadata
   */
  @Column('json')
  dataDescription: ReportDataDescription;

  /**
   * Serialized reader state for restoration
   */
  @Column('json', { nullable: true })
  readerState: ReaderState | null;

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
