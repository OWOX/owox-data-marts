import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataMart } from './data-mart.entity';

@Entity('data_mart_business_owners')
export class DataMartBusinessOwner {
  @PrimaryColumn({ name: 'data_mart_id' })
  dataMartId: string;

  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => DataMart, dm => dm.businessOwners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_mart_id' })
  dataMart: DataMart;
}
