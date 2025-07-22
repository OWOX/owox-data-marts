import { Entity, Column, OneToMany, ManyToMany, Unique } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Role } from './role.entity.js';
import { User } from './user.entity.js';
import { Permission } from './permission.entity.js';

@Entity('projects')
@Unique(['slug'])
export class Project extends BaseEntity {
  @Column()
  name: string;

  @Column()
  slug: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @OneToMany(() => Role, role => role.project)
  roles: Role[];

  @OneToMany(() => Permission, permission => permission.project)
  permissions: Permission[];

  @ManyToMany(() => User, user => user.projects)
  users: User[];
}
