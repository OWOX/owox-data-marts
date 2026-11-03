import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { CleanupCredentialSetupsService } from '../../credentials/use-cases/cleanup-credential-setups.service';

@Injectable()
export class CleanupCredentialSetupsProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(CleanupCredentialSetupsProcessor.name);

  constructor(private readonly cleanup: CleanupCredentialSetupsService) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.CREDENTIAL_SETUP_CLEANUP;
  }

  getDefaultCron(): string {
    return '0 */5 * * * *';
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const deleted = await this.cleanup.run(options?.signal);
    if (deleted > 0) this.logger.log(`Deleted ${deleted} Credential setup requests`);
  }
}
