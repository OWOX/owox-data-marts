import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataDestination } from './data-destination.entity';
import { Context } from './context.entity';

@Entity('destination_contexts')
export class DestinationContext {
  @PrimaryColumn({ name: 'destination_id' })
  destinationId: string;

  @PrimaryColumn({ name: 'context_id' })
  contextId: string;

  @ManyToOne(() => DataDestination, dest => dest.contexts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destination_id' })
  destination: DataDestination;

  @ManyToOne(() => Context, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'context_id' })
  context: Context;
}
