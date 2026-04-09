import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
import { DataStorageCredential } from './data-storage-credential.entity';
import { CreatorAwareEntity } from './creator-aware-entity.interface';
import { StorageOwner } from './storage-owner.entity';

@Entity()
export class DataStorage implements CreatorAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: DataStorageType;

  @Column()
  projectId: string;

  @Column({ length: 255, nullable: true })
  title?: string;

  @Column({ type: 'json', nullable: true })
  config?: DataStorageConfig;

  @Column({ type: 'varchar', nullable: true })
  credentialId?: string | null;

  @OneToOne(() => DataStorageCredential, { nullable: true, eager: true })
  @JoinColumn({ name: 'credentialId' })
  credential?: DataStorageCredential | null;

  @Column({ type: 'boolean', default: true })
  availableForUse: boolean;

  @Column({ type: 'boolean', default: true })
  availableForMaintenance: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @OneToMany(() => StorageOwner, owner => owner.storage)
  owners: StorageOwner[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  get ownerIds(): string[] {
    return (this.owners ?? []).map(o => o.userId);
  }
}
