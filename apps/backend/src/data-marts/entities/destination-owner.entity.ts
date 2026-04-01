import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataDestination } from './data-destination.entity';

@Entity('destination_owners')
export class DestinationOwner {
  @PrimaryColumn({ name: 'destination_id' })
  destinationId: string;

  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => DataDestination, dest => dest.owners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destination_id' })
  destination: DataDestination;
}
