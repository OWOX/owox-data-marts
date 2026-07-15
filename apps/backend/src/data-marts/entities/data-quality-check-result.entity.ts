import { createHash } from 'crypto';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { z } from 'zod';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import {
  DataQualityCheckScope,
  DataQualityCheckScopeSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  DataQualityResultExample,
  DataQualityResultExampleSchema,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualityRun } from './data-quality-run.entity';

const safeIntegerNumberTransformer: ValueTransformer = {
  to(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Data Quality violation count must be a non-negative safe integer');
    }
    return value;
  },
  from(value: string | number): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('Persisted Data Quality violation count is outside the safe integer range');
    }
    return parsed;
  },
};

@Entity()
@Index('IDX_data_quality_check_result_run', ['dataQualityRunId'])
@Index('UQ_data_quality_result_rule', ['dataQualityRunId', 'ruleKeyHash'], { unique: true })
export class DataQualityCheckResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  dataQualityRunId: string;

  @ManyToOne(() => DataQualityRun, run => run.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataQualityRunId', referencedColumnName: 'id' })
  dataQualityRun: DataQualityRun;

  @Column({ type: 'text' })
  ruleKey: string;

  @Column({ type: 'varchar', length: 64 })
  ruleKeyHash: string;

  @Column({ type: 'varchar', length: 64 })
  category: DataQualityCategory;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataQualityCheckScope>(DataQualityCheckScopeSchema),
  })
  scope: DataQualityCheckScope;

  @Column({ type: 'varchar', length: 16 })
  severity: DataQualitySeverity;

  @Column({ type: 'varchar', length: 32 })
  status: DataQualityCheckStatus;

  @Column({ type: 'bigint', default: 0, transformer: safeIntegerNumberTransformer })
  violationCount: number;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataQualityResultExample[]>(
      DataQualityResultExampleSchema.array().max(3)
    ),
  })
  examples: DataQualityResultExample[];

  @Column({
    type: 'json',
    transformer: createZodTransformer<string[]>(z.array(z.string())),
  })
  executedSql: string[];

  @Column({ type: 'text', nullable: true })
  reproductionSql: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({
    type: 'json',
    nullable: true,
    transformer: createZodTransformer<Record<string, unknown> | null>(
      z.record(z.string(), z.unknown()),
      false
    ),
  })
  errorDetails: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  updateRuleKeyHash(): void {
    this.ruleKeyHash = createHash('sha256').update(this.ruleKey).digest('hex');
  }
}
