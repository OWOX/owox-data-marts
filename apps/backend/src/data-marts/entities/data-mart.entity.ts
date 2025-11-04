import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { DataStorage } from './data-storage.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartSchema, DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { ConnectorState } from './connector-state.entity';

@Entity()
export class DataMart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => DataStorage, { eager: true, cascade: true })
  @JoinColumn()
  storage: DataStorage;

  @OneToOne(() => ConnectorState, cs => cs.dataMart, { eager: true })
  connectorState?: ConnectorState;

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataMartSchema>(DataMartSchemaSchema, false),
    nullable: true,
  })
  schema?: DataMartSchema;

  @Column({ nullable: true })
  definitionType?: DataMartDefinitionType;

  @Column({ type: 'json', nullable: true })
  definition?: DataMartDefinition;

  @Column({ default: DataMartStatus.DRAFT })
  status: DataMartStatus;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  projectId: string;

  @Column()
  createdById: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
