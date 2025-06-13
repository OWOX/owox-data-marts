import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-types/data-storage-config.type';

@Entity()
export class DataStorage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: DataStorageType;

  @Column()
  projectId: string;

  @Column({ type: 'json', nullable: true })
  credentials?: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  config?: DataStorageConfig;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
