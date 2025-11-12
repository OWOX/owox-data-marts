import { SystemTrigger } from '../shared/entities/system-trigger.entity';
import { SystemTriggerType } from './system-trigger-type';

export interface SystemTaskProcessor {
  readonly type: SystemTriggerType;
  process(trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void>;
}
