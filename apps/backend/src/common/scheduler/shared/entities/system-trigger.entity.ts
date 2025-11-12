import { Column, Entity } from 'typeorm';
import { ScheduledTrigger } from './scheduled-trigger.entity';

@Entity('system_triggers')
export class SystemTrigger extends ScheduledTrigger {
  @Column()
  type: string;
}
