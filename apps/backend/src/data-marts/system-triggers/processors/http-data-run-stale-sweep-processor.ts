import { Injectable, Logger } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { DataMartRunService } from '../../services/data-mart-run.service';
import { HTTP_DATA_RUN_STALE_AFTER_MS } from '../../services/http-data/http-data.constants';

@Injectable()
export class HttpDataRunStaleSweepProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(HttpDataRunStaleSweepProcessor.name);

  constructor(
    private readonly dataMartRunService: DataMartRunService,
    private readonly systemTimeService: SystemTimeService
  ) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.HTTP_DATA_RUN_STALE_SWEEP;
  }

  getDefaultCron(): string {
    return '0 */15 * * * *';
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return;

    const cutoff = new Date(this.systemTimeService.now().getTime() - HTTP_DATA_RUN_STALE_AFTER_MS);
    const count = await this.dataMartRunService.interruptStaleHttpDataRuns(cutoff);
    if (count > 0) this.logger.log(`Interrupted ${count} stale HTTP Data runs`);
  }
}
