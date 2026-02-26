import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataMart } from './data-mart.entity';
import {
  InsightTemplateSources,
  InsightTemplateSourcesSchema,
} from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightTemplateSourceEntity } from './insight-template-source.entity';

@Entity()
export class InsightTemplate implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  template?: string;

  @OneToMany(() => InsightTemplateSourceEntity, sourceEntity => sourceEntity.insightTemplate, {
    cascade: true,
    eager: true,
    orphanedRowAction: 'delete',
  })
  sourceEntities: InsightTemplateSourceEntity[];

  get sources(): InsightTemplateSources {
    return (this.sourceEntities ?? []).map(sourceEntity => ({
      templateSourceId: sourceEntity.id ?? null,
      key: sourceEntity.key,
      type: sourceEntity.type,
      artifactId: sourceEntity.artifactId,
    }));
  }

  set sources(value: InsightTemplateSources) {
    const normalizedSources = InsightTemplateSourcesSchema.parse(value ?? []);
    const existingByTemplateSourceId = new Map(
      (this.sourceEntities ?? [])
        .filter((sourceEntity): sourceEntity is InsightTemplateSourceEntity =>
          Boolean(sourceEntity.id?.length)
        )
        .map(sourceEntity => [sourceEntity.id, sourceEntity])
    );
    const existingByKey = new Map(
      (this.sourceEntities ?? []).map(sourceEntity => [sourceEntity.key, sourceEntity])
    );

    this.sourceEntities = normalizedSources.map(source => {
      const sourceEntity =
        (source.templateSourceId
          ? existingByTemplateSourceId.get(source.templateSourceId)
          : undefined) ??
        existingByKey.get(source.key) ??
        new InsightTemplateSourceEntity();
      sourceEntity.key = source.key;
      sourceEntity.type = source.type;
      sourceEntity.artifactId = source.artifactId;
      sourceEntity.insightTemplate = this;
      return sourceEntity;
    });
  }

  @Column({ type: 'text', nullable: true })
  lastRenderedTemplate?: string;

  @Column({ nullable: true })
  lastRenderedTemplateUpdatedAt?: Date;

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
