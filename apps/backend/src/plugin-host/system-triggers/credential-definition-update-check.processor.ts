import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../common/scheduler/system-tasks/system-trigger-type';
import { CredentialExternalDefinitionRegistryService } from '../../data-marts/credentials/services/credential-external-definition-registry.service';
import { ExternalCredentialDefinitionSyncService } from '../services/external-credential-definition-sync.service';

const CRON = '*/5 * * * *';
const BATCH_LIMIT = 50;

/** Daily, deployment-wide refresh of every external Credential definition. */
@Injectable()
export class CredentialDefinitionUpdateCheckProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(CredentialDefinitionUpdateCheckProcessor.name);

  constructor(
    private readonly registry: CredentialExternalDefinitionRegistryService,
    private readonly sync: ExternalCredentialDefinitionSyncService
  ) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.CREDENTIAL_DEFINITION_UPDATE_CHECK;
  }

  getDefaultCron(): string {
    return CRON;
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const now = new Date();
    const due = await this.registry.listDue(now, BATCH_LIMIT);
    for (const definition of due) {
      if (options?.signal?.aborted) break;
      try {
        await this.sync.syncLocator(`@${definition.repoOwner}/${definition.repoName}`);
      } catch (error) {
        this.logger.warn(
          `Credential definition ${definition.id} update failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      } finally {
        // A failure leaves the accepted version active and waits for the next daily slot.
        await this.registry.reschedule(definition.id, now);
      }
    }
  }
}
