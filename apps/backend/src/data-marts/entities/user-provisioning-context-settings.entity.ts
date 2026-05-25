import { Column, Entity, PrimaryColumn } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';

/**
 * ODM-local context defaults for users auto-provisioned into an IDP project.
 *
 * IDP/analytics owns project membership and role. ODM owns context scope, so
 * this table stores only the default role scope for future members.
 */
@Entity('user_provisioning_context_settings')
export class UserProvisioningContextSettings {
  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'role_scope', default: RoleScope.ENTIRE_PROJECT })
  roleScope: RoleScope;
}
