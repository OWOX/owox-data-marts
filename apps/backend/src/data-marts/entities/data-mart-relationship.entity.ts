import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataStorage } from './data-storage.entity';
import { DataMart } from './data-mart.entity';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import {
  BlendedFieldConfig,
  BlendedFieldsSchema,
  JoinCondition,
  JoinConditionsSchema,
} from '../dto/schemas/relationship-schemas';

@Entity()
export class DataMartRelationship implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DataStorage, { eager: true })
  @JoinColumn()
  dataStorage: DataStorage;

  @ManyToOne(() => DataMart, { eager: true })
  @JoinColumn()
  sourceDataMart: DataMart;

  @ManyToOne(() => DataMart, { eager: true })
  @JoinColumn()
  targetDataMart: DataMart;

  @Column({ length: 255 })
  targetAlias: string;

  @Column({
    type: 'json',
    transformer: createZodTransformer<JoinCondition[]>(JoinConditionsSchema),
  })
  joinConditions: JoinCondition[];

  @Column({
    type: 'json',
    transformer: createZodTransformer<BlendedFieldConfig[]>(BlendedFieldsSchema),
  })
  blendedFields: BlendedFieldConfig[];

  @Column()
  projectId: string;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
