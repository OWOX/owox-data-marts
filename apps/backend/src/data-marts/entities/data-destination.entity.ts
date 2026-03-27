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
import {
  DataDestinationType,
  isEmailBasedDataDestinationType,
} from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredential } from './data-destination-credential.entity';
import { CreatorAwareEntity } from './creator-aware-entity.interface';

@Entity()
export class DataDestination implements CreatorAwareEntity {
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

  @OneToOne(() => DataDestinationCredential, { nullable: true, eager: true })
  @JoinColumn({ name: 'credentialId' })
  credential?: DataDestinationCredential | null;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  isEmailBased(): boolean {
    return isEmailBasedDataDestinationType(this.type);
  }
}
