import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';

@Entity('context')
@Index('idx_context_project', ['projectId'])
@Index('uq_context_project_name', ['projectId', 'name', 'deletedAt'], { unique: true })
export class Context {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** User-picked icon (same values as a Data Mart icon); null renders the default one. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  icon?: DataMartIconValue | null;

  @Column()
  projectId: string;

  @Column({ type: 'varchar', nullable: true })
  createdById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
