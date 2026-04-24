import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataMart } from './data-mart.entity';
import { Context } from './context.entity';

@Entity('data_mart_contexts')
export class DataMartContext {
  @PrimaryColumn({ name: 'data_mart_id' })
  dataMartId: string;

  @PrimaryColumn({ name: 'context_id' })
  contextId: string;

  @ManyToOne(() => DataMart, dm => dm.contexts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_mart_id' })
  dataMart: DataMart;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
