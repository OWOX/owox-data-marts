import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Context } from './context.entity';

@Entity('member_role_contexts')
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
