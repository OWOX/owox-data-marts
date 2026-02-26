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
import { DataMart } from './data-mart.entity';
import { InsightTemplate } from './insight-template.entity';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';

@Entity()
@Index('idx_ai_src_sess_dataMart_createdBy_updatedAt', ['dataMartId', 'createdById', 'updatedAt'])
@Index('idx_ai_src_sess_templateId', ['templateId'])
export class AiAssistantSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  dataMartId: string;

  @ManyToOne(() => DataMart)
  @JoinColumn({ name: 'dataMartId' })
  dataMart: DataMart;

  @Column({ type: 'varchar' })
  scope: AiAssistantScope;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', nullable: false })
  templateId: string;

  @ManyToOne(() => InsightTemplate, { nullable: false })
  @JoinColumn({ name: 'templateId' })
  insightTemplate?: InsightTemplate;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
