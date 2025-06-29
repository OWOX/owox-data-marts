import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import {
  DataDestinationCredentials,
  DataDestinationCredentialsSchema,
} from '../data-destination-types/data-destination-credentials.type';
import { createZodTransformer } from '../../common/zod/zod-transformer';

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

  @Column({
    type: 'json',
    transformer: createZodTransformer<DataDestinationCredentials>(DataDestinationCredentialsSchema),
  })
  credentials: DataDestinationCredentials;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
