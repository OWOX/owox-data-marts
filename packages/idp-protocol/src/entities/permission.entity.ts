import { Entity, Column, ManyToOne, Unique, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Project } from './project.entity.js';

@Entity('permissions')
@Unique(['project', 'resource', 'action'])
export class Permission extends BaseEntity {
  @Column()
  resource: string;

  @Column()
  action: string;

  @Column({ type: 'jsonb', default: {} })
  conditions: Record<string, any>;

  @ManyToOne(() => Project, project => project.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
