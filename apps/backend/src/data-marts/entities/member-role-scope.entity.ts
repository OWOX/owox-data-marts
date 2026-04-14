import { Entity, PrimaryColumn, Column } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';

@Entity('member_role_scope')
export class MemberRoleScope {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'role_scope', default: RoleScope.ENTIRE_PROJECT })
  roleScope: RoleScope;
}
