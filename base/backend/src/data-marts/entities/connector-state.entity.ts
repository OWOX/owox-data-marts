import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ConnectorState as State } from '../connector-types/interfaces/connector-state';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { ConnectorOutputStateSchema } from '../connector-types/connector-message/schemas/connector-state.schema';

@Entity()
export class ConnectorState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  datamartId: string;

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
