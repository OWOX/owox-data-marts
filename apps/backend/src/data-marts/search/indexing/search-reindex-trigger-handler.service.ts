import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../../common/scheduler/shared/trigger-handler.interface';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { SearchReindexTrigger } from '../../entities/search/search-reindex-trigger.entity';
import {
  SearchDataDestinationProjectReindexTrigger,
  SearchDataMartProjectReindexTrigger,
  SearchDataStorageProjectReindexTrigger,
  SearchProjectReindexTrigger,
} from '../../entities/search/search-project-reindex-trigger.entity';
import { SearchIndexerService } from './search-indexer.service';

const ENTITY_PROCESSING_CRON = '*/2 * * * * *';
const ENTITY_STUCK_TRIGGER_TIMEOUT_SECONDS = 5 * 60;
const ENTITY_TRIGGER_TTL_SECONDS = 2 * 60 * 60;
const ENTITY_PROCESSING_BATCH_LIMIT = 2;

const DATA_MART_PROJECT_PROCESSING_CRON = '0,30 * * * * *';
const DATA_STORAGE_PROJECT_PROCESSING_CRON = '10,40 * * * * *';
const DATA_DESTINATION_PROJECT_PROCESSING_CRON = '20,50 * * * * *';
const PROJECT_STUCK_TRIGGER_TIMEOUT_SECONDS = 60 * 60;
const PROJECT_TRIGGER_TTL_SECONDS = 24 * 60 * 60;
const PROJECT_PROCESSING_BATCH_LIMIT = 1;

abstract class BaseSearchTriggerHandler<
  TTrigger extends SearchReindexTrigger | SearchProjectReindexTrigger,
>
  implements TriggerHandler<TTrigger>, OnModuleInit
{
  protected constructor(
    private readonly schedulerFacade: SchedulerFacade,
    private readonly triggerRepo: Repository<TTrigger>,
    protected readonly indexer: SearchIndexerService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }

  getTriggerRepository(): Repository<TTrigger> {
    return this.triggerRepo;
  }

  waitForBatchCompletion(): boolean {
    return true;
  }

  abstract processingCronExpression(): string;
  abstract stuckTriggerTimeoutSeconds(): number;
  abstract triggerTtlSeconds(): number;
  abstract processingBatchLimit(): number;
  abstract handleTrigger(trigger: TTrigger, options?: { signal?: AbortSignal }): Promise<void>;
}

abstract class BaseSearchProjectReindexTriggerHandler<
  TTrigger extends SearchProjectReindexTrigger,
> extends BaseSearchTriggerHandler<TTrigger> {
  protected constructor(
    schedulerFacade: SchedulerFacade,
    triggerRepo: Repository<TTrigger>,
    indexer: SearchIndexerService,
    private readonly entityType: SearchableEntityType
  ) {
    super(schedulerFacade, triggerRepo, indexer);
  }

  stuckTriggerTimeoutSeconds(): number {
    return PROJECT_STUCK_TRIGGER_TIMEOUT_SECONDS;
  }

  triggerTtlSeconds(): number {
    return PROJECT_TRIGGER_TTL_SECONDS;
  }

  processingBatchLimit(): number {
    return PROJECT_PROCESSING_BATCH_LIMIT;
  }

  async handleTrigger(trigger: TTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    const stats = await this.indexer.syncTypeProject(
      this.entityType,
      trigger.projectId,
      options?.signal
    );
    if (!options?.signal?.aborted && (stats.errors > 0 || stats.embedFailed > 0)) {
      throw new Error(
        `search project reindex failed for ${this.entityType} project=${trigger.projectId}: errors=${stats.errors}, embedFailed=${stats.embedFailed}`
      );
    }
  }
}

@Injectable()
export class SearchEntityReindexTriggerHandler extends BaseSearchTriggerHandler<SearchReindexTrigger> {
  constructor(
    @Inject(SCHEDULER_FACADE) schedulerFacade: SchedulerFacade,
    @InjectRepository(SearchReindexTrigger)
    triggerRepo: Repository<SearchReindexTrigger>,
    indexer: SearchIndexerService
  ) {
    super(schedulerFacade, triggerRepo, indexer);
  }

  processingCronExpression(): string {
    return ENTITY_PROCESSING_CRON;
  }

  stuckTriggerTimeoutSeconds(): number {
    return ENTITY_STUCK_TRIGGER_TIMEOUT_SECONDS;
  }

  triggerTtlSeconds(): number {
    return ENTITY_TRIGGER_TTL_SECONDS;
  }

  processingBatchLimit(): number {
    return ENTITY_PROCESSING_BATCH_LIMIT;
  }

  async handleTrigger(
    trigger: SearchReindexTrigger,
    _options?: { signal?: AbortSignal }
  ): Promise<void> {
    const entityType = trigger.entityType as SearchableEntityType;

    if (trigger.operation === 'DELETE') {
      await this.indexer.deleteEntity(entityType, trigger.entityId);
      return;
    }

    await this.indexer.reindexEntity(entityType, trigger.entityId, trigger.projectId);
  }
}

@Injectable()
export class SearchDataMartProjectReindexTriggerHandler extends BaseSearchProjectReindexTriggerHandler<SearchDataMartProjectReindexTrigger> {
  constructor(
    @Inject(SCHEDULER_FACADE) schedulerFacade: SchedulerFacade,
    @InjectRepository(SearchDataMartProjectReindexTrigger)
    triggerRepo: Repository<SearchDataMartProjectReindexTrigger>,
    indexer: SearchIndexerService
  ) {
    super(schedulerFacade, triggerRepo, indexer, SearchableEntityType.DATA_MART);
  }

  processingCronExpression(): string {
    return DATA_MART_PROJECT_PROCESSING_CRON;
  }
}

@Injectable()
export class SearchDataStorageProjectReindexTriggerHandler extends BaseSearchProjectReindexTriggerHandler<SearchDataStorageProjectReindexTrigger> {
  constructor(
    @Inject(SCHEDULER_FACADE) schedulerFacade: SchedulerFacade,
    @InjectRepository(SearchDataStorageProjectReindexTrigger)
    triggerRepo: Repository<SearchDataStorageProjectReindexTrigger>,
    indexer: SearchIndexerService
  ) {
    super(schedulerFacade, triggerRepo, indexer, SearchableEntityType.DATA_STORAGE);
  }

  processingCronExpression(): string {
    return DATA_STORAGE_PROJECT_PROCESSING_CRON;
  }
}

@Injectable()
export class SearchDataDestinationProjectReindexTriggerHandler extends BaseSearchProjectReindexTriggerHandler<SearchDataDestinationProjectReindexTrigger> {
  constructor(
    @Inject(SCHEDULER_FACADE) schedulerFacade: SchedulerFacade,
    @InjectRepository(SearchDataDestinationProjectReindexTrigger)
    triggerRepo: Repository<SearchDataDestinationProjectReindexTrigger>,
    indexer: SearchIndexerService
  ) {
    super(schedulerFacade, triggerRepo, indexer, SearchableEntityType.DATA_DESTINATION);
  }

  processingCronExpression(): string {
    return DATA_DESTINATION_PROJECT_PROCESSING_CRON;
  }
}
