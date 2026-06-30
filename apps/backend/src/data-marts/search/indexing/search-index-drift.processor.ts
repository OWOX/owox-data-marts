import { Inject, Injectable, Logger } from '@nestjs/common';
import { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';
import { BaseSystemTaskProcessor } from '../../../common/scheduler/system-tasks/base-system-task.processor';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { AdvancedSearchIndexSyncService } from '../../services/advanced-search-index-sync.service';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';

@Injectable()
export class SearchIndexDriftProcessor extends BaseSystemTaskProcessor {
  private readonly logger = new Logger(SearchIndexDriftProcessor.name);

  constructor(
    private readonly registry: IndexableSourceRegistry,
    private readonly indexSync: AdvancedSearchIndexSyncService,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig
  ) {
    super();
  }

  getType(): SystemTriggerType {
    return SystemTriggerType.SEARCH_INDEX_DRIFT;
  }

  getDefaultCron(): string {
    return this.config.driftCron;
  }

  async process(_trigger: SystemTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    for (const source of this.registry.all()) {
      if (options?.signal?.aborted) break;

      const projectIds = await source.listProjectIds();
      for (const projectId of projectIds) {
        if (options?.signal?.aborted) break;
        await this.indexSync.scheduleTypeProjectSync(source.entityType, projectId);
      }
    }
  }
}
