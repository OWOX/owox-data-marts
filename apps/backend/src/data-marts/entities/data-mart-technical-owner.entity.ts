import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DataMart } from './data-mart.entity';

@Entity('data_mart_technical_owners')
export class DataMartTechnicalOwner {
  @PrimaryColumn({ name: 'data_mart_id' })
  dataMartId: string;

  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => DataMart, dm => dm.technicalOwners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_mart_id' })
  dataMart: DataMart;
}
