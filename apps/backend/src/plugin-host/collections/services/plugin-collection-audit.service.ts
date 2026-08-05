import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThan, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from '../../../config/plugin-collections-data-source-options.config';
import { PLUGIN_COLLECTION_LIMITS } from '../constants/plugin-collection-limits';
import type { PluginCollectionRuntimeContext } from '../dto/domain/plugin-collection.types';
import {
  PluginCollectionAuditAction,
  PluginCollectionAuditEvent,
  PluginCollectionAuditOutcome,
} from '../entities/plugin-collection-audit-event.collection.entity';

export interface PluginCollectionAuditInput {
  readonly collectionName: string;
  readonly documentId?: string | null;
  readonly parentType?: string | null;
  readonly parentId?: string | null;
  readonly action: PluginCollectionAuditAction;
  readonly outcome: PluginCollectionAuditOutcome;
  readonly metadata?: Record<string, unknown> | null;
}

@Injectable()
export class PluginCollectionAuditService {
  constructor(
    @InjectRepository(PluginCollectionAuditEvent, PLUGIN_COLLECTIONS_DATA_SOURCE)
    private readonly repository: Repository<PluginCollectionAuditEvent>
  ) {}

  @Transactional({ connectionName: PLUGIN_COLLECTIONS_DATA_SOURCE })
  async record(
    context: PluginCollectionRuntimeContext,
    input: PluginCollectionAuditInput
  ): Promise<void> {
    const cutoff = new Date(
      Date.now() - PLUGIN_COLLECTION_LIMITS.auditRetentionDays * 24 * 60 * 60 * 1000
    );
    await this.repository.delete({ projectId: context.projectId, createdAt: LessThan(cutoff) });
    await this.trimOldest(
      { pluginId: context.pluginId, projectId: context.projectId },
      PLUGIN_COLLECTION_LIMITS.maxAuditRowsPerPluginProject
    );
    await this.trimOldest(
      { projectId: context.projectId },
      PLUGIN_COLLECTION_LIMITS.maxAuditRowsPerProject
    );

    await this.repository.save(
      this.repository.create({
        pluginId: context.pluginId,
        projectId: context.projectId,
        userId: context.userId,
        installationId: context.installationId,
        collectionName: input.collectionName,
        documentId: input.documentId ?? null,
        parentType: input.parentType ?? null,
        parentId: input.parentId ?? null,
        action: input.action,
        outcome: input.outcome,
        metadata: input.metadata ?? null,
      })
    );
  }

  private async trimOldest(
    where: FindOptionsWhere<PluginCollectionAuditEvent>,
    limit: number
  ): Promise<void> {
    const overflow = (await this.repository.countBy(where)) - limit + 1;
    if (overflow <= 0) return;

    const oldest = await this.repository.find({
      select: { id: true },
      where,
      order: { createdAt: 'ASC', id: 'ASC' },
      take: overflow,
    });
    if (oldest.length) {
      await this.repository.delete({ id: In(oldest.map(event => event.id)) });
    }
  }
}
