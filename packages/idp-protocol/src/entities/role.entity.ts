import {
  Entity,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Unique,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Project } from './project.entity.js';
import { Permission } from './permission.entity.js';
import { UserRole } from './user-role.entity.js';

@Entity('roles')
@Unique(['project', 'name'])
export class Role extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @ManyToOne(() => Project, project => project.roles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Permission[];

  @OneToMany(() => UserRole, (userRole: UserRole) => userRole.role)
  userRoles: UserRole[];
}
