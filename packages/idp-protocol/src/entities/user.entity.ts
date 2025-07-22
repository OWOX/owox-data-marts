import { Entity, Column, OneToMany, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { UserRole } from './user-role.entity.js';
import { OAuthAccount } from './oauth-account.entity.js';
import { Project } from './project.entity.js';
import { JsonColumn, BooleanColumn } from '../decorators/column.decorators.js';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  @Index()
  email: string;

  @BooleanColumn()
  emailVerified: boolean;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  passwordHash?: string;

  @JsonColumn()
  metadata: Record<string, any>;

  @OneToMany(() => UserRole, userRole => userRole.user)
  userRoles: UserRole[];

  @OneToMany(() => OAuthAccount, account => account.user)
  oauthAccounts: OAuthAccount[];

  @ManyToMany(() => Project, project => project.users)
  @JoinTable({
    name: 'user_projects',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'project_id' },
  })
  projects: Project[];
}
