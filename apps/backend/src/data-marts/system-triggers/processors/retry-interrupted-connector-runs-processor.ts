import { Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { SystemTaskProcessor } from '../../../common/scheduler/system-tasks/system-task-processor.interface';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { ConnectorExecutionService } from '../../services/connector-execution.service';

@Injectable()
export class RetryInterruptedConnectorRunsProcessor implements SystemTaskProcessor {
  readonly type = SystemTriggerType.RETRY_INTERRUPTED_CONNECTOR_RUNS;
  private readonly logger = new Logger(RetryInterruptedConnectorRunsProcessor.name);

  constructor(private readonly connectorExecutionService: ConnectorExecutionService) {}

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) {
      this.logger.debug('Retry interrupted connector runs aborted before start');
      return;
    }

    this.logger.debug('Executing retry interrupted connector runs');
    await this.connectorExecutionService.executeInterruptedRuns();
  }
}
