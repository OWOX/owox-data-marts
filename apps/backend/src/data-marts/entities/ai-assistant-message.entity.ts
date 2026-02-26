import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AssistantProposedAction } from '../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantSession } from './ai-assistant-session.entity';

@Entity()
@Index('idx_ai_src_msg_session_createdAt', ['sessionId', 'createdAt'])
export class AiAssistantMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => AiAssistantSession)
  @JoinColumn({ name: 'sessionId' })
  session: AiAssistantSession;

  @Column({ type: 'varchar' })
  role: AiAssistantMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'json', nullable: true })
  proposedActions?: AssistantProposedAction[] | null;

  @Column({ type: 'text', nullable: true })
  sqlCandidate?: string | null;

  @Column({ type: 'json', nullable: true })
  meta?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
