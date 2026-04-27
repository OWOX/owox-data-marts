import { Entity, Index, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Context } from './context.entity';

/**
 * Junction (project_member × context) → drives `selected_contexts` access.
 *
 * No FK on `user_id` / `project_id`: user identity is owned by the IDP
 * service (cross-process), not by this database. Same convention as
 * `data_mart_business_owners` / `storage_owners` / `destination_owners`.
 */
@Entity('member_role_contexts')
@Index('idx_mrc_context', ['contextId'])
export class MemberRoleContext {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @PrimaryColumn({ name: 'context_id' })
  contextId: string;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
