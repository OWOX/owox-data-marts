import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataMartRun } from './data-mart-run.entity';
import { DataMart } from './data-mart.entity';

@Entity()
export class Insight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  template?: string;

  @ManyToOne(() => DataMart)
  @JoinColumn()
  dataMart: DataMart;

  @Column({ nullable: true })
  lastDataMartRunId?: string;

  @OneToOne(() => DataMartRun)
  @JoinColumn({ name: 'lastDataMartRunId' })
  lastDataMartRun?: DataMartRun | null;

  @Column({ nullable: true })
  output?: string;

  @Column({ nullable: true })
  outputUpdatedAt?: Date;

  @Column()
  createdById: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
