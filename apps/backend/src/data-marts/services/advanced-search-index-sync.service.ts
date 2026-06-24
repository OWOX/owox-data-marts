import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SearchableEntityType } from '../../common/search/search.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import {
  ReindexOperation,
  SearchReindexTrigger,
} from '../entities/search/search-reindex-trigger.entity';
import {
  SearchDataDestinationProjectReindexTrigger,
  SearchDataMartProjectReindexTrigger,
  SearchDataStorageProjectReindexTrigger,
  SearchProjectReindexTrigger,
} from '../entities/search/search-project-reindex-trigger.entity';

const PROJECT_DEDUP_STATUSES = [TriggerStatus.IDLE, TriggerStatus.READY, TriggerStatus.PROCESSING];

@Injectable()
export class AdvancedSearchIndexSyncService {
  private readonly logger = new Logger(AdvancedSearchIndexSyncService.name);

  constructor(
    @InjectRepository(SearchReindexTrigger)
    private readonly triggerRepo: Repository<SearchReindexTrigger>,
    @InjectRepository(SearchDataMartProjectReindexTrigger)
    private readonly dataMartProjectTriggerRepo: Repository<SearchDataMartProjectReindexTrigger>,
    @InjectRepository(SearchDataStorageProjectReindexTrigger)
    private readonly dataStorageProjectTriggerRepo: Repository<SearchDataStorageProjectReindexTrigger>,
    @InjectRepository(SearchDataDestinationProjectReindexTrigger)
    private readonly dataDestinationProjectTriggerRepo: Repository<SearchDataDestinationProjectReindexTrigger>
  ) {}

  async scheduleReindex(
    entityType: SearchableEntityType,
    entityId: string,
    projectId: string
  ): Promise<void> {
    await this.runBestEffort('scheduleReindex', { entityType, entityId, projectId }, () =>
      this.enqueue(entityType, entityId, 'REINDEX', projectId)
    );
  }

  async scheduleDelete(
    entityType: SearchableEntityType,
    entityId: string,
    projectId: string
  ): Promise<void> {
    await this.runBestEffort('scheduleDelete', { entityType, entityId, projectId }, () =>
      this.enqueue(entityType, entityId, 'DELETE', projectId)
    );
  }

  async scheduleReindexMany(
    entityType: SearchableEntityType,
    entityIds: string[],
    projectId: string
  ): Promise<void> {
    for (const entityId of [...new Set(entityIds)]) {
      await this.scheduleReindex(entityType, entityId, projectId);
    }
  }

  async scheduleTypeProjectSync(
    entityType: SearchableEntityType,
    projectId: string
  ): Promise<void> {
    await this.runBestEffort('scheduleTypeProjectSync', { entityType, projectId }, () =>
      this.enqueueTypeProjectSync(this.projectTriggerRepoFor(entityType), projectId)
    );
  }

  private async runBestEffort(
    action: string,
    context: Record<string, string>,
    fn: () => Promise<void>
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`${action} failed: ${this.formatError(err)} ${this.formatContext(context)}`);
    }
  }

  private async enqueue(
    entityType: SearchableEntityType,
    entityId: string,
    operation: ReindexOperation,
    projectId: string
  ): Promise<void> {
    const where = {
      entityType,
      entityId,
      status: TriggerStatus.IDLE,
    };

    const existing = await this.triggerRepo.findOne({
      where,
    });

    if (existing) {
      if (existing.status !== TriggerStatus.IDLE) {
        return;
      }

      existing.operation = operation;
      existing.projectId = projectId;
      await this.triggerRepo.save(existing);
      return;
    }

    await this.triggerRepo.save(
      this.triggerRepo.create({
        entityType,
        entityId,
        operation,
        projectId,
        isActive: true,
        status: TriggerStatus.IDLE,
      })
    );
  }

  private projectTriggerRepoFor(
    entityType: SearchableEntityType
  ): Repository<SearchProjectReindexTrigger> {
    switch (entityType) {
      case SearchableEntityType.DATA_MART:
        return this.dataMartProjectTriggerRepo;
      case SearchableEntityType.DATA_STORAGE:
        return this.dataStorageProjectTriggerRepo;
      case SearchableEntityType.DATA_DESTINATION:
        return this.dataDestinationProjectTriggerRepo;
    }
  }

  private async enqueueTypeProjectSync(
    triggerRepo: Repository<SearchProjectReindexTrigger>,
    projectId: string
  ): Promise<void> {
    const existing = await triggerRepo.findOne({
      where: {
        projectId,
        status: In(PROJECT_DEDUP_STATUSES),
      },
    });

    if (existing) {
      return;
    }

    await triggerRepo.save(
      triggerRepo.create({
        projectId,
        isActive: true,
        status: TriggerStatus.IDLE,
      })
    );
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private formatContext(context: Record<string, string>): string {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
  }
}
