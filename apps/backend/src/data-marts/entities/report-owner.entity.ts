import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Report } from './report.entity';

@Entity('report_owners')
export class ReportOwner {
  @PrimaryColumn({ name: 'report_id' })
  reportId: string;

  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Report, report => report.owners, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: Report;
}
