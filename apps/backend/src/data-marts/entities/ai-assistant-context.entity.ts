import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AgentFlowConversationSnapshot,
  AgentFlowStateSnapshot,
} from '../ai-insights/agent-flow/types';
import { AiAssistantSession } from './ai-assistant-session.entity';

@Entity('ai_assistant_context')
@Index('idx_ai_assistant_context_updatedAt', ['updatedAt'])
export class AiAssistantContext {
  @PrimaryColumn({ type: 'varchar' })
  sessionId: string;

  @OneToOne(() => AiAssistantSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: AiAssistantSession;

  @Column({ type: 'json', nullable: true, default: null })
  conversationSnapshot?: AgentFlowConversationSnapshot | null;

  @Column({ type: 'json', nullable: true, default: null })
  stateSnapshot?: AgentFlowStateSnapshot | null;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
