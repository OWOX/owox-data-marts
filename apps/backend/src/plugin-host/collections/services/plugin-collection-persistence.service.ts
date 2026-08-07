import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from '../../../config/plugin-collections-data-source-options.config';
import { PLUGIN_COLLECTION_LIMITS } from '../constants/plugin-collection-limits';
import type {
  ListPluginCollectionCommand,
  PluginCollectionDocumentDto,
  PluginCollectionPageDto,
  PutPluginCollectionCommand,
  ResolvedPluginCollection,
} from '../dto/domain/plugin-collection.types';
import { PluginCollectionDocument } from '../entities/plugin-collection-document.collection.entity';
import { PluginCollectionUsage } from '../entities/plugin-collection-usage.collection.entity';
import {
  PluginCollectionNotFoundError,
  PluginCollectionValidationError,
} from '../errors/plugin-collection.errors';
import { PluginCollectionMapper } from '../mappers/plugin-collection.mapper';
import { PluginCollectionAuditService } from './plugin-collection-audit.service';
import { PluginCollectionAuthorizationService } from './plugin-collection-authorization.service';
import { PluginCollectionQuotaService } from './plugin-collection-quota.service';

@Injectable()
export class PluginCollectionPersistenceService {
  constructor(
    @InjectRepository(PluginCollectionDocument, PLUGIN_COLLECTIONS_DATA_SOURCE)
    private readonly documents: Repository<PluginCollectionDocument>,
    @InjectRepository(PluginCollectionUsage, PLUGIN_COLLECTIONS_DATA_SOURCE)
    private readonly usages: Repository<PluginCollectionUsage>,
    @InjectDataSource(PLUGIN_COLLECTIONS_DATA_SOURCE)
    private readonly dataSource: DataSource,
    private readonly authorization: PluginCollectionAuthorizationService,
    private readonly audit: PluginCollectionAuditService,
    private readonly mapper: PluginCollectionMapper,
    private readonly quota: PluginCollectionQuotaService
  ) {}

  async get(
    resolved: ResolvedPluginCollection,
    documentId: string,
    command: PutPluginCollectionCommand['context']
  ): Promise<PluginCollectionDocumentDto> {
    const entity = await this.documents.findOneBy({
      namespaceKey: resolved.namespaceKey,
      documentKey: this.hash(documentId),
    });
    if (!entity) throw new PluginCollectionNotFoundError();
    await this.authorization.assertAllowed(resolved.declaration, 'read', entity.parentId, command);
    return this.mapper.toResponse(entity);
  }

  @Transactional({ connectionName: PLUGIN_COLLECTIONS_DATA_SOURCE })
  async list(
    resolved: ResolvedPluginCollection,
    command: ListPluginCollectionCommand
  ): Promise<PluginCollectionPageDto> {
    const after = command.cursor ? this.decodeCursor(command.cursor) : null;
    const selectedIds: string[] = [];
    // Reserve enough for the page envelope, nextCursor and item separators.
    let responseBytes = 128;
    // Authorization is deliberately a bounded scan, not "scan until the requested number
    // of visible rows is found". Otherwise a member who can see few parents can turn one
    // request into thousands of main-DB permission checks. A short page with a cursor is valid.
    const scanLimit = resolved.declaration.entityBinding
      ? Math.min(PLUGIN_COLLECTION_LIMITS.maxAuthorizationScanRows, command.limit * 2)
      : command.limit;
    // Phase 1 reads metadata only. Loading 200 maximum-sized JSON values before checking
    // authorization would make one list request allocate roughly 200 MiB.
    const batch = await this.documents.find({
      select: {
        id: true,
        documentKey: true,
        documentId: true,
        parentId: true,
        documentSizeBytes: true,
        createdAt: true,
        modifiedAt: true,
      },
      where: {
        namespaceKey: resolved.namespaceKey,
        ...(after ? { documentKey: MoreThan(after) } : {}),
      },
      order: { documentKey: 'ASC' },
      take: scanLimit + 1,
    });
    const candidates = batch.slice(0, scanLimit);
    const allowedParents = await this.authorization.filterAllowed(
      resolved.declaration,
      candidates.flatMap(item => (item.parentId ? [item.parentId] : [])),
      command.context
    );
    let lastInspected: string | null = null;
    let stoppedEarly = false;
    let deniedCount = 0;

    for (const candidate of candidates) {
      const bindingIsValidAndAllowed = resolved.declaration.entityBinding
        ? Boolean(candidate.parentId && allowedParents.has(candidate.parentId))
        : candidate.parentId === null;
      if (!bindingIsValidAndAllowed) {
        deniedCount += 1;
        lastInspected = candidate.documentKey;
        continue;
      }
      const itemBytes = this.projectedResponseBytes(candidate) + (selectedIds.length ? 1 : 0);
      if (
        selectedIds.length > 0 &&
        responseBytes + itemBytes > PLUGIN_COLLECTION_LIMITS.maxPageBytes
      ) {
        stoppedEarly = true;
        break;
      }
      selectedIds.push(candidate.id);
      responseBytes += itemBytes;
      lastInspected = candidate.documentKey;
      if (selectedIds.length === command.limit) {
        stoppedEarly = candidate !== candidates[candidates.length - 1];
        break;
      }
    }

    const hasMore = stoppedEarly || batch.length > scanLimit;
    // Phase 2 loads JSON only for authorized documents that fit the requested page.
    const selected = selectedIds.length ? await this.documents.findBy({ id: In(selectedIds) }) : [];
    const selectedById = new Map(selected.map(entity => [entity.id, entity]));
    const items = selectedIds.map(id => this.mapper.toResponse(selectedById.get(id)!));

    if (deniedCount > 0) {
      await this.audit.record(command.context, {
        collectionName: command.collectionName,
        action: 'LIST',
        outcome: 'AUTHORIZATION_DENIED',
        metadata: { deniedCount },
      });
    }

    return {
      items,
      nextCursor:
        hasMore && lastInspected ? Buffer.from(lastInspected, 'utf8').toString('base64url') : null,
    };
  }

  @Transactional({ connectionName: PLUGIN_COLLECTIONS_DATA_SOURCE })
  async put(
    resolved: ResolvedPluginCollection,
    command: PutPluginCollectionCommand
  ): Promise<PluginCollectionDocumentDto> {
    const size = this.quota.documentSize(command.document);

    const rows = await this.lockUsageRows(
      resolved,
      command.context.pluginId,
      command.context.projectId
    );
    const documentKey = this.hash(command.documentId);
    const existing = await this.findForMutation(resolved.namespaceKey, documentKey);
    const operation = existing ? 'update' : 'create';
    await this.authorization.assertAllowed(
      resolved.declaration,
      operation,
      existing ? existing.parentId : command.parentId,
      command.context
    );
    // Do not reveal whether a guessed document id exists to a member who cannot access
    // its parent. Authorization must run against the stored parent before this distinction.
    if (existing && existing.parentId !== command.parentId) {
      throw new PluginCollectionValidationError('parentId is immutable');
    }

    const byteDelta = size - (existing?.documentSizeBytes ?? 0);
    const countDelta = existing ? 0 : 1;
    this.quota.assertUsage(rows, byteDelta, countDelta);

    const entity = this.documents.create({
      ...(existing ?? {}),
      namespaceKey: resolved.namespaceKey,
      documentKey,
      pluginId: command.context.pluginId,
      projectId: command.context.projectId,
      scope: resolved.declaration.scope,
      memberId: resolved.memberId,
      collectionName: command.collectionName,
      documentId: command.documentId,
      parentType: resolved.declaration.entityBinding?.type ?? null,
      parentId: command.parentId,
      document: command.document,
      documentSizeBytes: size,
      createdByUserId: existing?.createdByUserId ?? command.context.userId,
      modifiedByUserId: command.context.userId,
    });
    const saved = await this.documents.save(entity);
    await this.updateUsage(rows, byteDelta, countDelta);
    await this.audit.record(command.context, {
      collectionName: command.collectionName,
      documentId: command.documentId,
      parentType: entity.parentType,
      parentId: entity.parentId,
      action: 'PUT',
      outcome: 'SUCCESS',
      metadata: { operation, sizeBytes: size },
    });
    return this.mapper.toResponse(saved);
  }

  @Transactional({ connectionName: PLUGIN_COLLECTIONS_DATA_SOURCE })
  async delete(
    resolved: ResolvedPluginCollection,
    command: Omit<PutPluginCollectionCommand, 'document' | 'parentId'>
  ): Promise<void> {
    const rows = await this.lockUsageRows(
      resolved,
      command.context.pluginId,
      command.context.projectId
    );
    const existing = await this.findForMutation(
      resolved.namespaceKey,
      this.hash(command.documentId)
    );
    if (!existing) throw new PluginCollectionNotFoundError();
    await this.authorization.assertAllowed(
      resolved.declaration,
      'delete',
      existing.parentId,
      command.context
    );
    await this.documents.remove(existing);
    await this.updateUsage(rows, -existing.documentSizeBytes, -1);
    await this.audit.record(command.context, {
      collectionName: command.collectionName,
      documentId: command.documentId,
      parentType: existing.parentType,
      parentId: existing.parentId,
      action: 'DELETE',
      outcome: 'SUCCESS',
    });
  }

  private async findForMutation(namespaceKey: string, documentKey: string) {
    const query = this.documents
      .createQueryBuilder('document')
      .where('document.namespaceKey = :namespaceKey', { namespaceKey })
      .andWhere('document.documentKey = :documentKey', { documentKey });
    if (this.dataSource.options.type === 'mysql') query.setLock('pessimistic_write');
    return query.getOne();
  }

  private async lockUsageRows(
    resolved: ResolvedPluginCollection,
    pluginId: string,
    projectId: string
  ): Promise<PluginCollectionUsage[]> {
    const values: Array<Partial<PluginCollectionUsage>> = [
      {
        usageKey: this.hash(`namespace:${resolved.namespaceKey}`),
        level: 'namespace',
        pluginId,
        projectId,
        namespaceKey: resolved.namespaceKey,
        documentCount: 0,
        totalBytes: '0',
      },
      {
        usageKey: this.hash(`plugin-project:${pluginId}:${projectId}`),
        level: 'plugin-project',
        pluginId,
        projectId,
        namespaceKey: null,
        documentCount: 0,
        totalBytes: '0',
      },
      {
        usageKey: this.hash(`project:${projectId}`),
        level: 'project',
        pluginId: null,
        projectId,
        namespaceKey: null,
        documentCount: 0,
        totalBytes: '0',
      },
    ];
    await this.usages.createQueryBuilder().insert().values(values).orIgnore().execute();
    const query = this.usages
      .createQueryBuilder('usage')
      .where('usage.usageKey IN (:...keys)', { keys: values.map(row => row.usageKey) })
      .orderBy('usage.usageKey', 'ASC');
    if (this.dataSource.options.type === 'mysql') query.setLock('pessimistic_write');
    return query.getMany();
  }

  private async updateUsage(
    rows: PluginCollectionUsage[],
    byteDelta: number,
    countDelta: number
  ): Promise<void> {
    for (const row of rows) {
      row.totalBytes = String(Number(row.totalBytes) + byteDelta);
      row.documentCount += countDelta;
    }
    await this.usages.save(rows);
  }

  private decodeCursor(cursor: string): string {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      if (!/^[a-f0-9]{64}$/.test(decoded)) {
        throw new Error('invalid');
      }
      return decoded;
    } catch {
      throw new PluginCollectionValidationError('Invalid pagination cursor');
    }
  }

  private projectedResponseBytes(
    entity: Pick<
      PluginCollectionDocument,
      'documentId' | 'parentId' | 'documentSizeBytes' | 'createdAt' | 'modifiedAt'
    >
  ): number {
    const shell = {
      id: entity.documentId,
      ...(entity.parentId ? { parentId: entity.parentId } : {}),
      document: null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.modifiedAt.toISOString(),
    };
    // JSON `null` occupies four bytes. Replacing it with the already measured document
    // gives the exact serialized response size without loading the document itself.
    return Buffer.byteLength(JSON.stringify(shell), 'utf8') - 4 + entity.documentSizeBytes;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
