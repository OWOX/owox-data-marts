import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ProjectSetupSteps } from '../dto/domain/project-setup-steps.interface';

@Entity()
export class ProjectSetupProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  projectId: string;

  @Column({ default: 1 })
  stepsSchemaVersion: number;

  @Column({ type: 'json' })
  steps: ProjectSetupSteps;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
