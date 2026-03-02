import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
import { DataStorageCredential } from './data-storage-credential.entity';

@Entity()
export class DataStorage {
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

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
