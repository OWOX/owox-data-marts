import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AiAssistantApplyActionResponse } from '../dto/domain/ai-assistant-apply-action-response.dto';
import { AiAssistantSession } from './ai-assistant-session.entity';

@Entity('ai_assistant_apply_actions')
@Index('uq_ai_assistant_apply_action_session_request', ['sessionId', 'requestId'], { unique: true })
@Index('idx_ai_assistant_apply_action_createdBy', ['createdById'])
export class AiAssistantApplyAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => AiAssistantSession)
  @JoinColumn({ name: 'sessionId' })
  session: AiAssistantSession;

  @Column({ type: 'varchar', length: 255 })
  requestId: string;

  @Column()
  createdById: string;

  @Column({ type: 'json', nullable: true })
  response?: AiAssistantApplyActionResponse | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
