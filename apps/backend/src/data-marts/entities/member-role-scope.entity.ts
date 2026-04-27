import { Entity, PrimaryColumn, Column } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';

/**
 * Per-member role scope (`entire_project` vs `selected_contexts`).
 *
 * No FK on `user_id` / `project_id`: user identity is owned by the IDP
 * service. `getRoleScope(userId, projectId)` returns ENTIRE_PROJECT when
 * no row exists, so Stage 3 behaviour is preserved without backfill.
 */
@Entity('member_role_scope')
export class MemberRoleScope {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'role_scope', default: RoleScope.ENTIRE_PROJECT })
  roleScope: RoleScope;
}
