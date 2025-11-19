import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity()
export class ConnectorSourceCredentials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  connectorName: string;

  @Column({ type: 'json' })
  credentials: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  user?: {
    id?: string;
    name?: string;
    email?: string;
    picture?: string;
  };

  @Column({ nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
