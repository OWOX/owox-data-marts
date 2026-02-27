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
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from './insight-artifact.entity';
import { InsightTemplate } from './insight-template.entity';

@Entity('insight_template_source')
@Index('uq_ins_tpl_source_template_key', ['templateId', 'key'], { unique: true })
@Index('idx_ins_tpl_source_template', ['templateId'])
@Index('idx_ins_tpl_source_artifact', ['artifactId'])
export class InsightTemplateSourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  templateId: string;

  @ManyToOne(() => InsightTemplate, insightTemplate => insightTemplate.sourceEntities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'templateId' })
  insightTemplate: InsightTemplate;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  type: InsightTemplateSourceType;

  @Column({ type: 'varchar', nullable: false })
  artifactId: string;

  @ManyToOne(() => InsightArtifact, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'artifactId' })
  insightArtifact: InsightArtifact;

  sql(): string {
    return (this.insightArtifact ? this.insightArtifact.sql : null)?.trim() ?? '';
  }

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
