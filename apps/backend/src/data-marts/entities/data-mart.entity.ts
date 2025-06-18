import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataStorage } from './data-storage.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';

@Entity()
export class DataMart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => DataStorage, { eager: true, cascade: true })
  @JoinColumn()
  storage: DataStorage;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
