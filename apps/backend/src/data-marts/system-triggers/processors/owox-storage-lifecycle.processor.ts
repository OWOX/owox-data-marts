import { Injectable } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { OwoxStorageConfigService } from '../../owox-storage/owox-storage-config.service';
import { OwoxStorageLifecycleService } from '../../owox-storage/owox-storage-lifecycle.service';

@Injectable()
export class OwoxStorageLifecycleProcessor extends BaseSystemTaskProcessor {
  constructor(
    private readonly lifecycle: OwoxStorageLifecycleService,
    private readonly config: OwoxStorageConfigService
  ) {
    super();
  }

  getType() {
    return SystemTriggerType.OWOX_STORAGE_LIFECYCLE;
  }

  getDefaultCron() {
    return '0 0 3 * * *';
  }

  isEnabled() {
    return this.config.isEnabled();
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    await this.lifecycle.runDaily(new Date(), options?.signal);
  }
}
