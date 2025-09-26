import { Module } from '@nestjs/common';
import { PublicOriginService } from './config/public-origin.service';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [SchedulerModule],
  providers: [PublicOriginService],
  exports: [SchedulerModule, PublicOriginService],
})
export class CommonModule {}
