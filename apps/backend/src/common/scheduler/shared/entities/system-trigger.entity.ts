import { Column, Entity, Index } from 'typeorm';
import { ScheduledTrigger } from './scheduled-trigger.entity';

@Entity('system_triggers')
@Index('idx_system_trigger_ready', ['isActive', 'status', 'nextRunTimestamp'])
export class SystemTrigger extends ScheduledTrigger {
  @Index('uq_system_trigger_type', { unique: true })
  @Column()
  type: string;
}
