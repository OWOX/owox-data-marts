import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { StepState } from '../dto/domain/project-setup-steps.interface';

@Entity()
@Index('idx_psup_projectId_userId', ['projectId', 'userId'], { unique: true })
export class ProjectSetupUserProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  userId: string;

  @Column({ type: 'json' })
  steps: Record<string, StepState>;

  @Column({ default: 1 })
  stepsSchemaVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
