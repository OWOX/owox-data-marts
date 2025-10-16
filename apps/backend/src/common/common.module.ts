import { Module } from '@nestjs/common';
import { PublicOriginService } from './config/public-origin.service';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ProducerModule } from './producer/producer.module.js';

@Module({
  imports: [SchedulerModule, ProducerModule],
  providers: [PublicOriginService],
  exports: [SchedulerModule, ProducerModule, PublicOriginService],
})
export class CommonModule {}
