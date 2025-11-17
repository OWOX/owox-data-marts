import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { ConnectorExecutionService } from '../../services/connector-execution.service';

@Injectable()
export class RetryInterruptedConnectorRunsProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(RetryInterruptedConnectorRunsProcessor.name);

  constructor(private readonly connectorExecutionService: ConnectorExecutionService) {
    super();
  }

  getType() {
    return SystemTriggerType.RETRY_INTERRUPTED_CONNECTOR_RUNS;
  }

  getDefaultCron() {
    return '0 */15 * * * *';
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      this.logger.debug('Retry interrupted connector runs aborted before start');
      return;
    }

    this.logger.debug('Executing retry interrupted connector runs');
    await this.connectorExecutionService.executeInterruptedRuns();
  }
}
