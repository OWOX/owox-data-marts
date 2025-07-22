import { Entity, ManyToOne, JoinColumn, PrimaryColumn, Column } from 'typeorm';
import { User } from './user.entity.js';
import { Role } from './role.entity.js';
import { Project } from './project.entity.js';

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @PrimaryColumn({ name: 'role_id' })
  roleId: string;

  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => User, user => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Role, role => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;
}
