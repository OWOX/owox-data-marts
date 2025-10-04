import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartScheduledTrigger } from '../../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../enums/scheduled-trigger-type.enum';
import { ScheduledTriggerProcessor } from '../interfaces/scheduled-trigger-processor.interface';
import { SCHEDULED_TRIGGER_PROCESSOR_RESOLVER } from '../scheduled-trigger-providers';

@Injectable()
export class ScheduledTriggerProcessorFacade {
  constructor(
    @Inject(SCHEDULED_TRIGGER_PROCESSOR_RESOLVER)
    private readonly resolver: TypeResolver<ScheduledTriggerType, ScheduledTriggerProcessor>
  ) {}

  async process(trigger: DataMartScheduledTrigger, signal?: AbortSignal): Promise<void> {
    const processor = await this.resolver.resolve(trigger.type);
    await processor.process(trigger, signal);
  }
}
