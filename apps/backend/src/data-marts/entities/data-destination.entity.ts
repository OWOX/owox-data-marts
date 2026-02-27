import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredential } from './data-destination-credential.entity';

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

  @OneToOne(() => DataDestinationCredential, { nullable: true })
  @JoinColumn({ name: 'credentialId' })
  credential?: DataDestinationCredential | null;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
