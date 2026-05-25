import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Context } from './context.entity';
import { UserProvisioningContextSettings } from './user-provisioning-context-settings.entity';

/**
 * Context ids attached to a project-level user-provisioning default.
 */
@Entity('user_provisioning_context_settings_contexts')
@Index('idx_upcsc_context', ['contextId'])
export class UserProvisioningContextSettingsContext {
  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @PrimaryColumn({ name: 'context_id' })
  contextId: string;

  @ManyToOne(() => UserProvisioningContextSettings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  settings: UserProvisioningContextSettings;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
