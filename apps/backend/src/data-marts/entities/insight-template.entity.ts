import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataMart } from './data-mart.entity';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import {
  InsightTemplateSources,
  InsightTemplateSourcesSchema,
} from '../dto/schemas/insight-template/insight-template-source.schema';

@Entity()
export class InsightTemplate implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  template?: string;

  @Column({
    type: 'json',
    transformer: createZodTransformer<InsightTemplateSources>(InsightTemplateSourcesSchema),
    default: [],
  })
  sources: InsightTemplateSources;

  @Column({ type: 'text', nullable: true })
  output?: string;

  @Column({ nullable: true })
  outputUpdatedAt?: Date;

  @Column({ nullable: true })
  lastManualDataMartRunId?: string;

  @ManyToOne(() => DataMart)
  @JoinColumn()
  dataMart: DataMart;

  @Column()
  createdById: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
