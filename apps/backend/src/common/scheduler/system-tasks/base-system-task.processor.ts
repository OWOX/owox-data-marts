import { SystemTrigger } from '../shared/entities/system-trigger.entity';
import { SystemTriggerType } from './system-trigger-type';

export abstract class BaseSystemTaskProcessor {
  abstract getType(): SystemTriggerType;
  abstract getDefaultCron(): string;
  abstract process(trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void>;
}
