import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
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
import { DestinationOwner } from './destination-owner.entity';
import { DestinationContext } from './destination-context.entity';

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

  @Column({ type: 'boolean', default: false })
  availableForUse: boolean;

  @Column({ type: 'boolean', default: false })
  availableForMaintenance: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @OneToMany(() => DestinationOwner, owner => owner.destination)
  owners: DestinationOwner[];

  @OneToMany(() => DestinationContext, ctx => ctx.destination)
  contexts: DestinationContext[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  get ownerIds(): string[] {
    return (this.owners ?? []).map(o => o.userId);
  }

  get contextIds(): string[] {
    return (this.contexts ?? []).map(c => c.contextId);
  }

  isEmailBased(): boolean {
    return isEmailBasedDataDestinationType(this.type);
  }
}
