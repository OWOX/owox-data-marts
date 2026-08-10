import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataStorage } from './data-storage.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartSchema, DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { ConnectorState } from './connector-state.entity';
import { DataMartTechnicalOwner } from './data-mart-technical-owner.entity';
import { DataMartContext } from './data-mart-context.entity';
import { DataMartBusinessOwner } from './data-mart-business-owner.entity';
import {
  BlendedFieldsConfig,
  BlendedFieldsConfigSchema,
} from '../dto/schemas/blended-fields-config.schema';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  SourceDataLastUpdated,
  SourceDataLastUpdatedSchema,
} from '../dto/schemas/source-data-last-updated.schema';

@Entity()
export class DataMart implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => DataStorage, { eager: true, cascade: true })
  @JoinColumn()
  storage: DataStorage;

  @OneToOne(() => ConnectorState, cs => cs.dataMart)
  connectorState?: ConnectorState;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataMartSchema>(DataMartSchemaSchema, false),
    nullable: true,
  })
  schema?: DataMartSchema;

  @Column({ type: 'datetime', nullable: true })
  schemaActualizedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  definitionType?: DataMartDefinitionType | null;

  @Column({ type: 'json', nullable: true })
  definition?: DataMartDefinition;

  @Column({ default: DataMartStatus.DRAFT })
  status: DataMartStatus;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  projectId: string;

  @Column({ type: 'boolean', default: true })
  availableForReporting: boolean;

  @Column({ type: 'boolean', default: true })
  availableForMaintenance: boolean;

  @OneToMany(() => DataMartBusinessOwner, owner => owner.dataMart)
  businessOwners: DataMartBusinessOwner[];

  @OneToMany(() => DataMartTechnicalOwner, owner => owner.dataMart)
  technicalOwners: DataMartTechnicalOwner[];

  @Column({
    type: 'json',
    transformer: createZodTransformer<BlendedFieldsConfig>(BlendedFieldsConfigSchema, false),
    nullable: true,
  })
  blendedFieldsConfig?: BlendedFieldsConfig;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataQualityConfig>(DataQualityConfigSchema, false),
    nullable: true,
  })
  dataQualityConfig?: DataQualityConfig | null;

  @OneToMany(() => DataMartContext, ctx => ctx.dataMart)
  contexts: DataMartContext[];

  /**
   * Last-known `Data Last Updated` snapshot for THIS Data Mart's own sources, refreshed as a
   * side effect of every user-triggered computation (Data Mart page / canvas refresh). Lists
   * read it for free instead of querying the warehouse per row; `computedAt` inside the block
   * tells the viewer how old the reading is. It is a journal of the last successful lookup —
   * never a cache consulted by the MCP/data paths, which always measure live.
   */
  @Column({
    type: 'json',
    transformer: createZodTransformer<SourceDataLastUpdated>(SourceDataLastUpdatedSchema, false),
    nullable: true,
  })
  dataLastUpdated?: SourceDataLastUpdated | null;

  @Column()
  createdById: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  get businessOwnerIds(): string[] {
    return (this.businessOwners ?? []).map(o => o.userId);
  }

  get technicalOwnerIds(): string[] {
    return (this.technicalOwners ?? []).map(o => o.userId);
  }

  get contextIds(): string[] {
    return (this.contexts ?? []).map(c => c.contextId);
  }
}
