import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { ConnectorState as State } from '../connector-types/interfaces/connector-state';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { ConnectorOutputStateSchema } from '../connector-types/connector-message/schemas/connector-state.schema';
import { DataMart } from './data-mart.entity';

@Entity()
export class ConnectorState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  datamartId: string;

  @OneToOne(() => DataMart, dm => dm.connectorState, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'datamartId', referencedColumnName: 'id' })
  dataMart: DataMart;

  @Column({
    type: 'json',
    nullable: true,
    transformer: createZodTransformer<State>(ConnectorOutputStateSchema, false),
  })
  state?: State;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
