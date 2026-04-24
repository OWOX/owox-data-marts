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
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { JoinCondition, JoinConditionsSchema } from '../dto/schemas/join-condition.schema';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { DataMart } from './data-mart.entity';
import { DataStorage } from './data-storage.entity';

@Entity()
@Index('UQ_data_mart_relationship_source_alias', ['sourceDataMart', 'targetAlias'], {
  unique: true,
})
@Index('IDX_dmr_dataStorage', ['dataStorage'])
@Index('IDX_dmr_targetDataMart', ['targetDataMart'])
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

  @Column()
  projectId: string;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
