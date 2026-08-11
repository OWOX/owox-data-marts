import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index('IDX_connector_definition_projectId', ['projectId'])
@Index('IDX_connector_definition_projectId_name', ['projectId', 'name'], { unique: true })
export class ConnectorDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  logo?: string | null;

  @Column({ type: 'varchar', nullable: true })
  docUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  activeVersionId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
