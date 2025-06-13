import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataStorageType } from '../enums/data-storage-type.enum';

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
  config?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
