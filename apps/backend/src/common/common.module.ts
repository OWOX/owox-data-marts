import { Module } from '@nestjs/common';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [SchedulerModule],
  exports: [SchedulerModule],
})
export class CommonModule {}
