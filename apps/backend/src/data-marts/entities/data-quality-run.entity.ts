import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { DataMartSchema, DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import {
  EffectiveDataQualityConfig,
  EffectiveDataQualityConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  DataQualityRelationshipSnapshot,
  DataQualityRelationshipSnapshotSchema,
  DataQualitySummary,
  DataQualitySummarySchema,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataMartRun } from './data-mart-run.entity';
import { DataQualityCheckResult } from './data-quality-check-result.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

@Entity()
export class DataQualityRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  dataMartRunId: string;

  @OneToOne(() => DataMartRun, run => run.dataQualityRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataMartRunId', referencedColumnName: 'id' })
  dataMartRun: DataMartRun;

  @Column({
    type: 'json',
    transformer: createZodTransformer<EffectiveDataQualityConfig>(EffectiveDataQualityConfigSchema),
  })
  configSnapshot: EffectiveDataQualityConfig;

  @Column({
    type: 'json',
    nullable: true,
    transformer: createZodTransformer<DataMartSchema | null>(DataMartSchemaSchema, false),
  })
  schemaSnapshot: DataMartSchema | null;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataQualityRelationshipSnapshot[]>(
      DataQualityRelationshipSnapshotSchema.array()
    ),
  })
  relationshipSnapshots: DataQualityRelationshipSnapshot[];

  @Column({ type: 'varchar', nullable: false })
  definitionTypeSnapshot: DataMartDefinitionType;

  @Column({ type: 'varchar', length: 255 })
  timezone: string;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataQualitySummary>(DataQualitySummarySchema),
  })
  summary: DataQualitySummary;

  @OneToMany(() => DataQualityCheckResult, result => result.dataQualityRun)
  results: DataQualityCheckResult[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  consumptionPublishedAt: Date | null;
}
