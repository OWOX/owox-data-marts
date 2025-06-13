import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataStorage } from './data-storage.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';

@Entity()
export class DataMart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => DataStorage, { eager: true, cascade: true })
  @JoinColumn()
  storage: DataStorage;

  @Column({ type: 'json', nullable: true })
  definition?: Record<string, unknown>;

  @Column()
  status: DataMartStatus;

  @Column()
  projectId: string;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
