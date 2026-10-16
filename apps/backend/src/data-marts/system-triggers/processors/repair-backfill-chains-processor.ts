import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { ConnectorExecutionService } from '../../services/connector/connector-execution.service';

/**
 * Queues the next segment of any backfill chain that stalled without its successor run —
 * after a failed queueing transaction, or a segment executed by an application version that
 * predates chains. A backfill must never stop silently.
 */
@Injectable()
export class RepairBackfillChainsProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(RepairBackfillChainsProcessor.name);

  constructor(private readonly connectorExecutionService: ConnectorExecutionService) {
    super();
  }

  getType() {
    return SystemTriggerType.REPAIR_BACKFILL_CHAINS;
  }

  getDefaultCron() {
    return '0 */15 * * * *';
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      this.logger.debug('Backfill chain repair aborted before start');
      return;
    }

    this.logger.debug('Executing backfill chain repair');
    await this.connectorExecutionService.repairBackfillChains();
  }
}
