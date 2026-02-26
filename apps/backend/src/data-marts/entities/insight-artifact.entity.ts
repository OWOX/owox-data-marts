import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataMart } from './data-mart.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';

@Entity()
export class InsightArtifact implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  sql: string;

  @Column({
    type: 'varchar',
    default: InsightArtifactValidationStatus.VALID,
  })
  validationStatus: InsightArtifactValidationStatus;

  @Column({ type: 'text', nullable: true })
  validationError?: string | null;

  @ManyToOne(() => DataMart)
  @JoinColumn()
  dataMart: DataMart;

  @Column()
  createdById: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
