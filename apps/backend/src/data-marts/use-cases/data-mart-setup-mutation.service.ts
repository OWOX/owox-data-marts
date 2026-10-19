import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ConnectorService } from '../services/connector/connector.service';
import { McpSetupDiscoveryMapper } from '../mappers/mcp-setup-discovery.mapper';
import { DataMartDefinitionSchema } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.schema';
import { containsNonBmpCharacters } from '../utils/contains-non-bmp-characters';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataMartCreatedEvent } from '../events/data-mart-created.event';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';
import { runInTransaction } from 'typeorm-transactional';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import { MutationResultReference } from '../../common/mutations/mutation-receipt.entity';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { RunType } from '../../common/scheduler/shared/types';
import {
  DataMartSetupCreateRequest,
  DataMartSetupDefinitionRequest,
  DataMartSetupMetadataRequest,
  DataMartSetupPublishRequest,
  DataMartSetupDeleteRequest,
  DataMartSetupMutationDto,
  DataMartSetupDefinitionInput,
} from '../dto/domain/data-mart-setup-mutation.dto';
import { DataMartSetupActor, DataMartSetupRequest } from '../facades/mcp-data-mart-setup.facade';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { ConnectorReferenceGuardService } from '../services/connector/connector-reference-guard.service';
import { lockContextReferences } from '../services/context/context-reference-guard';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { DeleteDataMartService } from './delete-data-mart.service';
import { DataMartSetupService } from './data-mart-setup.service';
import { DATA_MART_ICON_PATTERN, DATA_MART_ICON_MAX_LENGTH } from '../enums/data-mart-icon.enum';

const definitionInputSchema = z.union([
  z.object({ type: z.literal('SQL'), sqlQuery: z.string().min(1).max(1000000) }).strict(),
  z
    .object({ type: z.enum(['TABLE', 'VIEW']), fullyQualifiedName: z.string().min(1).max(2048) })
    .strict(),
  z.object({ type: z.literal('TABLE_PATTERN'), pattern: z.string().min(1).max(2048) }).strict(),
  z
    .object({
      type: z.literal('CONNECTOR'),
      connectorName: z.string().min(1).max(255),
      node: z.string().min(1).max(255),
      fields: z.array(z.string().min(1).max(255)).min(1).max(1000),
      version: z.number().int().positive().optional(),
      fullyQualifiedName: z.string().min(1).max(2048),
      preparationId: z.string().uuid().optional(),
      parameters: z
        .record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
        .optional(),
    })
    .strict(),
]);

/** Domain-owned setup mutations. Receipts and every local writer share the ambient main-DB manager. */
@Injectable()
export class DataMartSetupMutationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly receipts: MutationReceiptService,
    private readonly marts: DataMartService,
    private readonly storages: DataStorageService,
    private readonly access: AccessDecisionService,
    private readonly setup: DataMartSetupService,
    private readonly validator: DataMartDefinitionValidatorFacade,
    private readonly legacy: LegacyDataMartsService,
    private readonly deletion: DeleteDataMartService,
    private readonly execution: ConnectorExecutionService,
    private readonly connectorGuard: ConnectorReferenceGuardService,
    private readonly publicOrigin: PublicOriginService,
    private readonly connectors: ConnectorService,
    @Optional() private readonly events?: OwoxEventDispatcher,
    @Optional() private readonly search?: AdvancedSearchIndexSyncService
  ) {}

  async create(request: DataMartSetupCreateRequest): Promise<DataMartSetupMutationDto> {
    this.actor(request);
    this.metadata(request);
    const intent = {
      storageId: request.storageId,
      title: request.title,
      icon: request.icon ?? null,
    };
    const recovered = await this.recoverExisting(request, 'create', 'data-marts', intent);
    if (recovered) return recovered;
    await this.storageAccess(request, request.storageId);
    const storage = await this.storages.getByProjectIdAndId(request.projectId, request.storageId);
    if (storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      if (containsNonBmpCharacters(request.title))
        throw new BadRequestException('Legacy titles cannot contain emoji');
      const reserved = await this.externalReservation(
        request,
        'create',
        'data-marts',
        intent,
        storage.id
      );
      if (!reserved.claimed) return reserved.outcome!;
      // No provider request key exists. A failure remains unknown and must never repeat this POST.
      let remoteId: string;
      try {
        remoteId = (
          await this.legacy.createDataMart({
            title: request.title,
            gcpProjectId: (storage.config as { projectId: string }).projectId,
            query: 'SELECT 1',
          })
        ).id;
      } catch {
        return this.unknown(
          'data-marts',
          request.projectId,
          'Inspect Legacy Data Marts in the application and contact support to reconcile this operation before creating again.'
        );
      }
      return runInTransaction(async () => {
        const manager = this.manager();
        const mart = await this.insert(request, storage.id, manager, remoteId);
        await this.receipts.complete(manager, reserved.receiptId!, {
          resourceId: mart.id,
          revision: mart.revision,
        });
        return { state: 'completed' as const, resourceId: mart.id, revision: mart.revision };
      });
    }
    return runInTransaction(async () => {
      const manager = this.manager();
      const reservation = await this.receipts.reserve(
        manager,
        this.identity(request, 'create', 'data-marts'),
        intent
      );
      if (!reservation.claimed) return this.recover(request, reservation.receipt);
      const mart = await this.insert(request, storage.id, manager);
      const result = { resourceId: mart.id, revision: mart.revision };
      await this.receipts.complete(manager, reservation.receipt.id, result);
      return { state: 'completed' as const, ...result };
    });
  }

  async updateMetadata(request: DataMartSetupMetadataRequest): Promise<DataMartSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    this.metadata(request);
    const before = await this.require(request, Action.EDIT);
    if (
      before.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY &&
      request.title &&
      containsNonBmpCharacters(request.title)
    )
      throw new BadRequestException('Legacy titles cannot contain emoji');
    const patch = Object.fromEntries(
      ['title', 'description', 'icon']
        .filter(key => Object.hasOwn(request, key))
        .map(key => [key, request[key as keyof typeof request]])
    );
    if (!Object.keys(patch).length)
      throw new BadRequestException('Supply at least one metadata field');
    const saved = await runInTransaction(async () => {
      await this.require(request, Action.EDIT);
      return this.marts.writeConfiguration(
        this.manager(),
        request.dataMartId,
        request.projectId,
        request.expectedRevision,
        patch
      );
    });
    await this.search?.scheduleReindex(SearchableEntityType.DATA_MART, saved.id, request.projectId);
    let externalState: 'completed' | 'unknown' = 'completed';
    if (before.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      try {
        if (request.title !== undefined) await this.legacy.updateTitle(saved.id, request.title);
        if (request.description !== undefined)
          await this.legacy.updateDescription(saved.id, request.description ?? '');
      } catch {
        externalState = 'unknown';
      }
    }
    return {
      state: 'completed' as const,
      resourceId: saved.id,
      revision: saved.revision,
      externalState,
    };
  }

  async updateDefinition(
    request: DataMartSetupDefinitionRequest
  ): Promise<DataMartSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    if (!definitionInputSchema.safeParse(request.definition).success)
      throw new BadRequestException('Invalid definition input');
    const before = await this.require(request, Action.EDIT);
    if (before.revision !== request.expectedRevision)
      throw new ConflictException('Data Mart configuration changed');
    await this.storageAccess(request, before.storage.id);
    const definition = await this.definition(request.definition, before, request.userId);
    if (!definition)
      return this.appAction(
        request,
        'Save the production connector configuration and credentials in the application, then resume with its preparation reference.'
      );
    const nextType = request.definition.type as DataMartDefinitionType;
    if (
      before.definitionType &&
      before.definitionType !== nextType &&
      [before.definitionType, nextType].includes(DataMartDefinitionType.CONNECTOR)
    )
      throw new BadRequestException('Input source type cannot be changed to or from a connector');
    const candidate = Object.assign(new DataMart(), before, {
      definitionType: nextType,
      definition,
    });
    if (before.status === DataMartStatus.PUBLISHED || before.definitionType !== nextType)
      await this.validator.checkIsValid(candidate);
    const saved = await runInTransaction(async () => {
      const manager = this.manager();
      await lockContextReferences(manager, request.projectId, undefined, false);
      await this.connectorGuard.acquire(manager, request.projectId);
      const current = await this.require(request, Action.EDIT);
      await this.storageAccess(request, current.storage.id);
      if (current.status === DataMartStatus.PUBLISHED)
        await this.confirmImpact(request, 'definition');
      if (
        nextType === DataMartDefinitionType.CONNECTOR &&
        !(await this.definition(request.definition, current, request.userId))
      )
        throw new ConflictException('Connector preparation changed');
      return this.marts.writeConfiguration(
        manager,
        current.id,
        request.projectId,
        request.expectedRevision,
        { definitionType: nextType, definition }
      );
    });
    await this.search?.scheduleReindex(SearchableEntityType.DATA_MART, saved.id, request.projectId);
    let externalState: 'completed' | 'unknown' = 'completed';
    if (saved.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      try {
        await this.legacy.updateQuery(saved.id, (definition as { sqlQuery: string }).sqlQuery);
      } catch {
        externalState = 'unknown';
      }
    }
    return {
      state: 'completed' as const,
      resourceId: saved.id,
      revision: saved.revision,
      externalState,
    };
  }

  async publish(request: DataMartSetupPublishRequest): Promise<DataMartSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    // Recover committed publication before revalidating its original draft revision.
    const recovered = await this.recoverExisting(request, 'publish', request.dataMartId, {
      expectedRevision: request.expectedRevision,
    });
    if (recovered) return recovered;
    const before = await this.require(request, Action.EDIT);
    await this.storageAccess(request, before.storage.id);
    if (before.revision !== request.expectedRevision)
      throw new ConflictException('Data Mart configuration changed');
    if (before.status !== DataMartStatus.DRAFT || !before.definition)
      throw new BadRequestException('A configured draft is required');
    await this.validator.checkIsValid(before);
    return runInTransaction(async () => {
      const manager = this.manager();
      await lockContextReferences(manager, request.projectId, undefined, false);
      await this.connectorGuard.acquire(manager, request.projectId);
      const reservation = await this.receipts.reserve(
        manager,
        this.identity(request, 'publish', request.dataMartId),
        { expectedRevision: request.expectedRevision }
      );
      if (!reservation.claimed) return this.recover(request, reservation.receipt);
      const current = await this.require(request, Action.EDIT);
      await this.storageAccess(request, current.storage.id);
      const saved = await this.marts.writeConfiguration(
        manager,
        request.dataMartId,
        request.projectId,
        request.expectedRevision,
        { status: DataMartStatus.PUBLISHED }
      );
      const result: MutationResultReference = {
        resourceId: saved.id,
        revision: saved.revision,
        state: 'PUBLISHED',
      };
      if (saved.definitionType === DataMartDefinitionType.CONNECTOR) {
        result.runId = await this.execution.run(saved, request.userId, RunType.manual, {
          runType: 'INCREMENTAL',
        });
        const trigger = await manager
          .getRepository(ConnectorRunTrigger)
          .findOneByOrFail({ dataMartRunId: result.runId });
        result.triggerId = trigger.id;
      }
      await this.search?.scheduleReindex(
        SearchableEntityType.DATA_MART,
        saved.id,
        request.projectId
      );
      this.events?.publishLocalOnCommit(
        new DataMartPublishedEvent(
          saved.id,
          request.projectId,
          saved.createdById,
          DataMartStatus.DRAFT
        )
      );
      await this.receipts.complete(manager, reservation.receipt.id, result);
      return {
        ...this.result(result),
        audience: this.audience(Object.assign(saved, { contexts: current.contexts })),
      };
    });
  }

  async delete(request: DataMartSetupDeleteRequest): Promise<DataMartSetupMutationDto> {
    this.actor(request);
    this.revision(request.expectedRevision);
    const recovered = await this.recoverExisting(request, 'delete', request.dataMartId, {
      expectedRevision: request.expectedRevision,
      impactDigest: request.impactDigest,
    });
    if (recovered?.state === 'completed') return recovered;
    const before = await this.require(request, Action.DELETE);
    let receiptId: string | undefined;
    if (recovered) {
      if (before.storage.type !== DataStorageType.LEGACY_GOOGLE_BIGQUERY) return recovered;
      try {
        await this.legacy.getDataMartDetails(before.id);
        return recovered;
      } catch (error) {
        if (!(error instanceof NotFoundException)) return recovered;
      }
      const existing = await runInTransaction(() =>
        this.receipts.reserve(
          this.manager(),
          this.identity(request, 'delete', request.dataMartId),
          { expectedRevision: request.expectedRevision, impactDigest: request.impactDigest }
        )
      );
      receiptId = existing.receipt.id;
    }
    if (!receiptId && before.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      await this.confirmImpact(request, 'delete');
      const reserved = await this.externalReservation(request, 'delete', request.dataMartId, {
        expectedRevision: request.expectedRevision,
        impactDigest: request.impactDigest,
      });
      if (!reserved.claimed) return reserved.outcome!;
      receiptId = reserved.receiptId;
      try {
        await this.legacy.deleteDataMart(before.id);
      } catch {
        return this.unknown(
          before.id,
          request.projectId,
          'Inspect the known Legacy Data Mart ID in the application and reconcile the deletion before retrying.'
        );
      }
    }
    return runInTransaction(async () => {
      const manager = this.manager();
      await lockContextReferences(manager, request.projectId, undefined, false);
      await this.connectorGuard.acquire(manager, request.projectId);
      const reserved = receiptId
        ? null
        : await this.receipts.reserve(
            manager,
            this.identity(request, 'delete', request.dataMartId),
            { expectedRevision: request.expectedRevision, impactDigest: request.impactDigest }
          );
      if (reserved && !reserved.claimed) return this.recover(request, reserved.receipt);
      await this.require(request, Action.DELETE);
      await this.confirmImpact(request, 'delete');
      await this.deletion.run(
        new DeleteDataMartCommand(
          request.dataMartId,
          request.projectId,
          true,
          request.userId,
          request.roles,
          request.expectedRevision
        )
      );
      const result = {
        resourceId: request.dataMartId,
        deleted: true,
        revision: request.expectedRevision + 1,
      };
      await this.receipts.complete(manager, receiptId ?? reserved!.receipt.id, result);
      return { state: 'completed' as const, ...result };
    });
  }

  private async insert(
    request: DataMartSetupCreateRequest,
    storageId: string,
    manager: EntityManager,
    legacyId?: string
  ): Promise<DataMart> {
    await lockContextReferences(manager, request.projectId, undefined, false);
    await this.connectorGuard.acquire(manager, request.projectId);
    await this.storageAccess(request, storageId);
    const storage = await this.storages.getByProjectIdAndId(request.projectId, storageId);
    const mart = manager.getRepository(DataMart).create({
      ...(legacyId
        ? {
            id: legacyId,
            definitionType: DataMartDefinitionType.SQL,
            definition: { sqlQuery: 'SELECT 1' },
          }
        : {}),
      title: request.title,
      icon: request.icon ?? null,
      storage,
      projectId: request.projectId,
      createdById: request.userId,
      revision: 1,
      status: DataMartStatus.DRAFT,
      availableForMaintenance: true,
      availableForReporting: true,
    });
    await manager.getRepository(DataMart).insert(mart as QueryDeepPartialEntity<DataMart>);
    await manager
      .getRepository(DataMartTechnicalOwner)
      .save({ dataMartId: mart.id, userId: request.userId });
    await this.search?.scheduleReindex(SearchableEntityType.DATA_MART, mart.id, request.projectId);
    this.events?.publishLocalOnCommit(
      new DataMartCreatedEvent(mart.id, request.projectId, request.userId)
    );
    return mart;
  }

  private async confirmImpact(
    request: DataMartSetupDefinitionRequest | DataMartSetupDeleteRequest,
    action: 'definition' | 'delete'
  ) {
    if (!request.impactDigest)
      throw new BadRequestException('Explicit authorization of the current impact is required');
    const impact = await this.setup.impact({
      ...request,
      action,
      ...(action === 'definition'
        ? {
            nextDefinitionType: (request as DataMartSetupDefinitionRequest).definition
              .type as DataMartDefinitionType,
          }
        : {}),
    });
    if (
      impact.revision !== request.expectedRevision ||
      impact.impactDigest !== request.impactDigest
    )
      throw new ConflictException(
        'Data Mart impact changed; read impact and obtain authorization again'
      );
  }
  private async recoverExisting(
    request: DataMartSetupActor & { operationId: string },
    action: 'create' | 'publish' | 'delete',
    resourceId: string,
    intent: object
  ): Promise<DataMartSetupMutationDto | null> {
    return runInTransaction(async () => {
      const manager = this.manager();
      const receipt = await this.receipts.findExisting(
        manager,
        this.identity(request, action, resourceId),
        intent
      );
      return receipt ? this.recover(request, receipt, resourceId) : null;
    });
  }
  private async externalReservation(
    request: DataMartSetupActor & { operationId: string },
    action: string,
    resourceId: string,
    intent: object,
    storageId?: string
  ) {
    return runInTransaction(async () => {
      const manager = this.manager();
      const reserved = await this.receipts.reserve(
        manager,
        this.identity(request, action, resourceId),
        intent
      );
      if (!reserved.claimed)
        return {
          claimed: false,
          receiptId: reserved.receipt.id,
          outcome: await this.recover(request, reserved.receipt, resourceId),
        };
      if (storageId) {
        await lockContextReferences(manager, request.projectId, undefined, false);
        await this.storageAccess(request, storageId);
      }
      await this.receipts.markUnknown(manager, reserved.receipt.id);
      return { claimed: true, receiptId: reserved.receipt.id };
    });
  }
  private async recover(
    actor: DataMartSetupActor,
    receipt: { status: string; result: MutationResultReference | null },
    resourceId: string = 'data-marts'
  ): Promise<DataMartSetupMutationDto> {
    this.actor(actor);
    if (receipt.status !== 'completed' || !receipt.result)
      return this.unknown(
        resourceId,
        actor.projectId,
        'This operation needs reconciliation; do not dispatch it again.'
      );
    // A historical reference survives deletion or self-removal without exposing current data.
    return this.result(receipt.result);
  }
  private audience(mart: DataMart) {
    return {
      configurationRevision: mart.revision,
      availableForReporting: mart.availableForReporting,
      availableForMaintenance: mart.availableForMaintenance,
      contextIds: mart.contextIds,
    };
  }
  private result(result: MutationResultReference): DataMartSetupMutationDto {
    return {
      state: 'completed' as const,
      resourceId: result.resourceId,
      ...(result.revision !== undefined ? { revision: result.revision } : {}),
      ...(result.deleted !== undefined ? { deleted: result.deleted } : {}),
      ...(result.runId
        ? {
            runId: result.runId,
            triggerId: result.triggerId,
            publicationState: 'PUBLISHED',
            dataReady: false,
          }
        : result.state === 'PUBLISHED'
          ? { publicationState: 'PUBLISHED' }
          : {}),
    };
  }
  private identity(
    actor: DataMartSetupActor & { operationId: string },
    action: string,
    resourceId: string
  ) {
    return {
      projectId: actor.projectId,
      userId: actor.userId,
      action: `data-mart.${action}`,
      resourceId,
      operationId: actor.operationId,
    };
  }
  private manager(): EntityManager {
    const manager = this.dataSource.manager;
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Data Mart mutation must use the ambient transaction manager');
    return manager;
  }
  private actor(request: DataMartSetupActor) {
    if (
      !request.userId?.trim() ||
      !request.projectId?.trim() ||
      !request.roles?.some(role => role === 'admin' || role === 'editor')
    )
      throw new ForbiddenException('Current Setup actor and edit role are required');
  }
  private revision(value: number) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new BadRequestException('expectedRevision must be a positive safe integer');
  }
  private metadata(request: { title?: string; description?: string | null; icon?: unknown }) {
    if (
      request.title !== undefined &&
      (typeof request.title !== 'string' || !request.title.trim() || request.title.length > 255)
    )
      throw new BadRequestException('Invalid title');
    if (
      request.description !== undefined &&
      request.description !== null &&
      (typeof request.description !== 'string' || request.description.length > 100000)
    )
      throw new BadRequestException('Invalid description');
    if (
      request.icon !== undefined &&
      request.icon !== null &&
      (typeof request.icon !== 'string' ||
        request.icon.length > DATA_MART_ICON_MAX_LENGTH ||
        !DATA_MART_ICON_PATTERN.test(request.icon))
    )
      throw new BadRequestException('Invalid icon');
  }
  private async require(request: DataMartSetupRequest, action: Action): Promise<DataMart> {
    this.actor(request);
    const mart = await this.marts.getByIdAndProjectId(request.dataMartId, request.projectId);
    if (
      !(await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.DATA_MART,
        mart.id,
        action,
        request.projectId
      ))
    )
      throw new ForbiddenException('Data Mart action is forbidden');
    return mart;
  }
  private async storageAccess(request: DataMartSetupActor, storageId: string) {
    if (
      !(await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.STORAGE,
        storageId,
        Action.USE,
        request.projectId
      ))
    )
      throw new ForbiddenException('Storage USE permission is required');
  }
  private async definition(
    input: DataMartSetupDefinitionInput,
    before: DataMart,
    userId: string
  ): Promise<DataMartDefinition | null> {
    const supported = new McpSetupDiscoveryMapper().toStorage({
      ...before.storage,
      availableForUse: false,
      availableForMaintenance: false,
    }).capabilities.definitionTypes;
    if (!supported.includes(input.type))
      throw new BadRequestException('Definition type is not supported by this Storage');
    if (input.type === 'SQL') return DataMartDefinitionSchema.parse({ sqlQuery: input.sqlQuery });
    if (input.type === 'TABLE' || input.type === 'VIEW')
      return DataMartDefinitionSchema.parse({ fullyQualifiedName: input.fullyQualifiedName });
    if (input.type === 'TABLE_PATTERN')
      return DataMartDefinitionSchema.parse({ pattern: input.pattern });
    if (input.type !== 'CONNECTOR') throw new BadRequestException('Invalid definition type');
    const previous =
      before.definitionType === DataMartDefinitionType.CONNECTOR
        ? (before.definition as ConnectorDefinition)
        : undefined;
    if (
      input.preparationId &&
      (before.connectorPreparationId !== input.preparationId ||
        before.connectorPreparedById !== userId ||
        before.connectorPreparedRevision !== before.revision)
    )
      throw new ConflictException(
        'Connector production preparation is stale or belongs to another actor'
      );
    const effectiveVersion =
      input.version ??
      (previous && previous.connector.source.name === input.connectorName
        ? previous.connector.source.version
        : undefined);
    const specification = await this.connectors.resolveConnectorSpecification(
      before.projectId,
      input.connectorName,
      effectiveVersion
    );
    const capabilities = await this.connectors.resolveConnectorCapabilities(
      before.projectId,
      input.connectorName,
      effectiveVersion
    );
    let configurations =
      previous && previous.connector.source.name === input.connectorName
        ? previous.connector.source.configuration
        : undefined;
    if (input.parameters) {
      if (configurations && configurations.length !== 1)
        throw new BadRequestException(
          'Use the application to edit multiple connector configurations'
        );
      const parameters = z
        .record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
        .parse(input.parameters);
      for (const [name, value] of Object.entries(parameters)) {
        const parameter = specification.find(item => item.name === name);
        if (
          !parameter ||
          parameter.oneOf ||
          parameter.attributes?.some(attribute =>
            ['SECRET', 'OAUTH_FLOW', 'HIDE_IN_CONFIG_FORM'].includes(attribute)
          )
        )
          throw new BadRequestException(
            'Only declared non-secret scalar parameters are accepted; select credentials in the application'
          );
        const type = parameter.requiredType;
        if (
          value !== null &&
          ((type === 'number' && typeof value !== 'number') ||
            (['boolean', 'bool'].includes(type ?? '') && typeof value !== 'boolean') ||
            (['string', 'date'].includes(type ?? '') && typeof value !== 'string') ||
            ['object', 'array'].includes(type ?? ''))
        )
          throw new BadRequestException('Connector parameter has an invalid type');
        if (parameter.options && !parameter.options.includes(String(value)))
          throw new BadRequestException('Connector parameter is not an allowed option');
        if (
          parameter.minimum !== undefined &&
          typeof value === 'number' &&
          value < parameter.minimum
        )
          throw new BadRequestException('Connector parameter is below its minimum');
      }
      configurations = [{ ...(configurations?.[0] ?? { _id: randomUUID() }), ...parameters }];
    }
    if (!configurations) {
      if (specification.some(item => item.required)) return null;
      configurations = [{ _id: randomUUID() }];
    }
    if (capabilities.singleConfiguration && configurations.length !== 1)
      throw new BadRequestException('This connector requires one configuration');
    for (const configuration of configurations) {
      for (const parameter of specification) {
        if (!parameter.required) continue;
        const value = configuration[parameter.name];
        const externalCredential = configuration._secrets_id;
        const protectedParameter = parameter.attributes?.some(attribute =>
          ['SECRET', 'OAUTH_FLOW'].includes(attribute)
        );
        if (
          (value === undefined || value === null || value === '') &&
          !(protectedParameter && externalCredential)
        )
          return null;
      }
    }
    return DataMartDefinitionSchema.parse({
      connector: {
        source: {
          name: input.connectorName,
          node: input.node,
          fields: input.fields,
          configuration: configurations,
          ...(effectiveVersion !== undefined ? { version: effectiveVersion } : {}),
        },
        storage: { fullyQualifiedName: input.fullyQualifiedName },
      },
    });
  }

  private appAction(request: DataMartSetupRequest, nextStep: string): DataMartSetupMutationDto {
    return {
      state: 'app_action_required',
      resourceId: request.dataMartId,
      appUrl: new URL(
        `/ui/${encodeURIComponent(request.projectId)}/data-marts/${encodeURIComponent(request.dataMartId)}/data-setup`,
        this.publicOrigin.getPublicOrigin()
      ).toString(),
      nextStep,
    };
  }
  private unknown(
    resourceId: string,
    projectId: string,
    nextStep: string
  ): DataMartSetupMutationDto {
    return {
      state: 'unknown',
      resourceId,
      appUrl: new URL(
        `/ui/${encodeURIComponent(projectId)}/data-marts`,
        this.publicOrigin.getPublicOrigin()
      ).toString(),
      nextStep,
    };
  }
}
