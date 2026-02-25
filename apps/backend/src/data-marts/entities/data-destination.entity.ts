import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

@Entity()
export class DataDestination {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  type: DataDestinationType;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  credentialId?: string | null;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
