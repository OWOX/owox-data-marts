import { ConnectorAuthoringTestRun } from '../entities/connector-authoring-test-run.entity';
import { ConnectorManifestStaticValidationService } from '../services/connector/connector-manifest-static-validation.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Transactional } from 'typeorm-transactional';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import type { MutationReceipt } from '../../common/mutations/mutation-receipt.entity';
import type { CustomConnectorActor } from '../dto/domain/mcp-custom-connectors.dto';
import type {
  ConnectorActivateRequest,
  ConnectorCreateRequest,
  ConnectorDeleteRequest,
  ConnectorDraftRequest,
  ConnectorMetadataRequest,
  ConnectorMutationResult,
  ConnectorOperationRequest,
  ConnectorPreparationRequest,
  ConnectorPreparationResult,
  ConnectorPublishRequest,
  ConnectorTestApprovalRequest,
  ConnectorTestRequest,
} from '../dto/domain/connector-authoring.dto';
import { ConnectorAuthoringPreparation } from '../entities/connector-authoring-preparation.entity';
import { ConnectorProtectedValues } from '../entities/connector-protected-values.entity';
import { ConnectorDefinition } from '../entities/connector-definition.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorTestService } from '../services/connector/connector-test.service';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class ConnectorAppActionRequiredException extends ForbiddenException {
  constructor(readonly purpose: 'authoring' | 'test') {
    super('Complete the required review in the application');
  }
}

@Injectable()
export class ConnectorAuthoringService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly receipts: MutationReceiptService,
    private readonly marts: DataMartService,
    private readonly access: AccessDecisionService,
    private readonly tests: ConnectorTestService
  ) {}

  assertActor(actor: CustomConnectorActor): void {
    if (!actor.projectId?.trim() || !actor.userId?.trim())
      throw new UnauthorizedException('Actor and project are required');
    if (!actor.roles?.some(role => role === 'admin' || role === 'editor'))
      throw new ForbiddenException('Connector authoring requires editor access');
  }

  /** Called only by the app-authenticated preparation endpoint after explicit classification. */
  @Transactional()
  async prepare(request: ConnectorPreparationRequest): Promise<ConnectorPreparationResult> {
    this.assertActor(request);
    if (request.reviewedNonSecretContent !== true)
      throw new BadRequestException('Review the remaining manifest content in the application');
    await this.definitions.lockReferences(request.projectId);
    const definition = await this.definitions.getById(request.projectId, request.connectorId);
    if (definition.revision !== request.expectedRevision)
      throw new ConflictException('Connector changed');
    const version = await this.definitions.getVersion(
      request.projectId,
      definition.id,
      request.version
    );
    const latest = (await this.definitions.listVersions(request.projectId, definition.id)).at(-1);
    if (latest?.status === 'draft' && latest.version !== request.version)
      throw new ConflictException('Prepare the current draft before editing through the assistant');
    const safe = clone(version.manifest);
    const values: Record<string, unknown> = {};
    if (!Array.isArray(request.protectedPaths) || request.protectedPaths.length > 100)
      throw new BadRequestException('Invalid protected paths');
    for (const path of request.protectedPaths) {
      if (
        !Array.isArray(path) ||
        !path.length ||
        path.length > 32 ||
        path.some(
          key => typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)
        )
      )
        throw new BadRequestException('Invalid protected path');
      if (path.length === 1 && ['name', 'title', 'description', 'docUrl'].includes(path[0]))
        throw new BadRequestException(
          'Remove private values from public connector metadata before preparation'
        );
      let parent: Record<string, unknown> = safe;
      for (const key of path.slice(0, -1)) {
        const child = parent[key];
        if (!child || typeof child !== 'object')
          throw new BadRequestException('Invalid protected path');
        parent = child as Record<string, unknown>;
      }
      const key = path[path.length - 1];
      if (
        !Object.prototype.hasOwnProperty.call(parent, key) ||
        (key === 'name' && path.length === 1)
      )
        throw new BadRequestException('Invalid protected path');
      const ref = randomUUID();
      values[ref] = clone(parent[key]);
      parent[key] = { $protected: ref };
    }
    // References may only be created by this service, never supplied as existing content.
    this.assertReferences(safe, values);
    if (new ConnectorManifestStaticValidationService().hasUnprotectedKnownSecrets(safe))
      throw new BadRequestException(
        'Protect the remaining known credential fields in the application'
      );
    const manager = this.definitions.transactionManager;
    const protectedValues = await manager.getRepository(ConnectorProtectedValues).save({
      projectId: request.projectId,
      connectorId: definition.id,
      userId: request.userId,
      purpose: 'authoring',
      values,
    });
    const preparation = await manager.getRepository(ConnectorAuthoringPreparation).save({
      projectId: request.projectId,
      connectorId: definition.id,
      userId: request.userId,
      purpose: 'authoring',
      revision: definition.revision,
      version: version.version,
      sourceDigest: digest(version.manifest),
      protectedValuesId: protectedValues.id,
      safeManifest: safe,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      revokedAt: null,
    });
    return this.preparationResult(preparation);
  }

  @Transactional()
  async approveTest(
    request: ConnectorTestApprovalRequest
  ): Promise<{ approvalId: string; expiresAt: string }> {
    this.assertActor(request);
    await this.definitions.lockReferences(request.projectId);
    const definition = await this.definitions.getById(request.projectId, request.connectorId);
    const version = await this.definitions.getVersion(
      request.projectId,
      definition.id,
      request.version
    );
    if (definition.revision !== request.expectedRevision || version.status !== 'draft')
      throw new ConflictException('Approve the current saved draft');
    if (
      !request.configuration ||
      Buffer.byteLength(JSON.stringify(request.configuration)) > 120 * 1024
    )
      throw new BadRequestException('Invalid test configuration');
    const manager = this.definitions.transactionManager;
    const stored = await manager.getRepository(ConnectorProtectedValues).save({
      projectId: request.projectId,
      connectorId: definition.id,
      userId: request.userId,
      purpose: 'test',
      values: request.configuration,
    });
    const approval = await manager.getRepository(ConnectorAuthoringPreparation).save({
      projectId: request.projectId,
      connectorId: definition.id,
      userId: request.userId,
      purpose: 'test',
      revision: definition.revision,
      version: version.version,
      sourceDigest: digest(version.manifest),
      protectedValuesId: stored.id,
      safeManifest: {},
      expiresAt: new Date(Date.now() + 10 * 60_000),
      revokedAt: null,
    });
    return { approvalId: approval.id, expiresAt: approval.expiresAt.toISOString() };
  }

  @Transactional()
  async revoke(
    actor: CustomConnectorActor,
    preparationId: string,
    connectorId?: string
  ): Promise<void> {
    this.assertActor(actor);
    await this.definitions.transactionManager.getRepository(ConnectorAuthoringPreparation).update(
      {
        id: preparationId,
        projectId: actor.projectId,
        userId: actor.userId,
        ...(connectorId ? { connectorId } : {}),
      },
      { revokedAt: new Date() }
    );
  }

  async editing(actor: CustomConnectorActor, connectorId: string) {
    this.assertActor(actor);
    const definition = await this.definitions.getById(actor.projectId, connectorId);
    const row = await this.definitions.transactionManager
      .getRepository(ConnectorAuthoringPreparation)
      .findOne({
        where: {
          projectId: actor.projectId,
          connectorId,
          userId: actor.userId,
          purpose: 'authoring',
          revision: definition.revision,
        },
        order: { expiresAt: 'DESC' },
      });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now())
      return {
        state: 'preparation_required' as const,
        revision: definition.revision,
        editableDraft: null,
      };
    const version = await this.definitions.getVersion(actor.projectId, connectorId, row.version);
    if (digest(version.manifest) !== row.sourceDigest)
      return {
        state: 'preparation_required' as const,
        revision: definition.revision,
        editableDraft: null,
      };
    return {
      state: 'prepared' as const,
      revision: definition.revision,
      editableDraft: this.preparationResult(row),
    };
  }

  async currentTestApproval(actor: CustomConnectorActor, connectorId: string) {
    this.assertActor(actor);
    const definition = await this.definitions.getById(actor.projectId, connectorId);
    const row = await this.definitions.transactionManager
      .getRepository(ConnectorAuthoringPreparation)
      .findOne({
        where: {
          projectId: actor.projectId,
          connectorId,
          userId: actor.userId,
          purpose: 'test',
          revision: definition.revision,
        },
        order: { expiresAt: 'DESC' },
      });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
    const version = await this.definitions.getVersion(actor.projectId, connectorId, row.version);
    if (version.status !== 'draft' || digest(version.manifest) !== row.sourceDigest) return null;
    return {
      approvalId: row.id,
      revision: row.revision,
      version: row.version,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  @Transactional()
  async create(request: ConnectorCreateRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    if (request.manifest.name !== request.name)
      throw new BadRequestException('Manifest source name must match connector name');
    const manager = this.definitions.transactionManager;
    const reserved = await this.receipts.reserve(
      manager,
      { ...request, action: 'create_custom_connector', resourceId: 'custom-connectors' },
      {
        name: request.name,
        title: request.title,
        manifest: request.manifest,
        preparationId: request.preparationId ?? null,
      }
    );
    if (!reserved.claimed) return this.recover(request, reserved.receipt);
    let values: Record<string, unknown> = {};
    let reviewedManifest: Record<string, unknown> = {};
    if (request.preparationId) {
      const source = await manager.getRepository(ConnectorAuthoringPreparation).findOne({
        where: {
          id: request.preparationId,
          projectId: request.projectId,
          userId: request.userId,
          purpose: 'authoring',
        },
      });
      if (!source) throw new ForbiddenException('Prepare the source manifest in the application');
      const evidence = await this.evidence(
        { ...request, connectorId: source.connectorId, expectedRevision: source.revision },
        source.id,
        'authoring'
      );
      values = await this.protectedValues(request, evidence);
      reviewedManifest = evidence.safeManifest;
    }
    this.assertSafeDisplayFields(request.manifest);
    const restored = this.restore(request.manifest, values, reviewedManifest);
    if (new ConnectorManifestStaticValidationService().hasUnprotectedKnownSecrets(request.manifest))
      throw new BadRequestException('Use protected or parameter references for credential fields');
    const definition = await this.definitions.create(request.projectId, request.userId, {
      ...request,
      manifest: restored,
    });
    if (request.preparationId) {
      const stored = await manager.getRepository(ConnectorProtectedValues).save({
        projectId: request.projectId,
        connectorId: definition.id,
        userId: request.userId,
        purpose: 'authoring',
        values,
      });
      await manager.getRepository(ConnectorAuthoringPreparation).save({
        projectId: request.projectId,
        connectorId: definition.id,
        userId: request.userId,
        purpose: 'authoring',
        revision: 1,
        version: 1,
        sourceDigest: digest(restored),
        protectedValuesId: stored.id,
        safeManifest: request.manifest,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        revokedAt: null,
      });
    }
    const result: ConnectorMutationResult = {
      connectorId: definition.id,
      revision: definition.revision,
      version: 1,
      outcome: 'completed',
    };
    await this.receipts.complete(manager, reserved.receipt.id, {
      resourceId: definition.id,
      revision: definition.revision,
      versionId: '1',
    });
    return result;
  }

  @Transactional()
  async metadata(request: ConnectorMetadataRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    this.assertRevision(request.expectedRevision);
    const patch = {
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.description !== undefined ? { description: request.description } : {}),
      ...(request.docUrl !== undefined ? { docUrl: request.docUrl } : {}),
    };
    const definition = await this.definitions.updateMetadata(
      request.projectId,
      request.connectorId,
      patch,
      request.expectedRevision
    );
    return { connectorId: definition.id, revision: definition.revision, outcome: 'completed' };
  }

  @Transactional()
  async saveDraft(request: ConnectorDraftRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    await this.definitions.lockReferences(request.projectId);
    const preparation = await this.evidence(request, request.preparationId, 'authoring');
    const values = await this.protectedValues(request, preparation);
    const definitionBefore = await this.definitions.getById(request.projectId, request.connectorId);
    if (request.manifest.name !== definitionBefore.name)
      throw new BadRequestException('Manifest source name must match connector name');
    this.assertSafeDisplayFields(request.manifest);
    const restored = this.restore(request.manifest, values, preparation.safeManifest);
    if (new ConnectorManifestStaticValidationService().hasUnprotectedKnownSecrets(request.manifest))
      throw new BadRequestException('Protected credential references are required');
    const row = await this.definitions.saveDraft(
      request.projectId,
      request.connectorId,
      restored,
      request.expectedRevision
    );
    const definition = await this.definitions.getById(request.projectId, request.connectorId);
    await this.definitions.transactionManager.getRepository(ConnectorAuthoringPreparation).update(
      { id: preparation.id },
      {
        revision: definition.revision,
        version: row.version,
        sourceDigest: digest(restored),
        safeManifest: request.manifest as never,
      }
    );
    return {
      connectorId: definition.id,
      revision: definition.revision,
      version: row.version,
      outcome: 'completed',
    };
  }

  @Transactional()
  async publish(request: ConnectorPublishRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    return this.localOperation(
      request,
      'publish_custom_connector',
      {
        version: request.version,
        preparationId: request.preparationId,
        impactDigest: request.impactDigest,
      },
      async () => {
        const preparation = await this.evidence(request, request.preparationId, 'authoring');
        if (preparation.version !== request.version)
          throw new ConflictException('Preparation is for another version');
        const impact = await this.impact(request, request.connectorId, request.version);
        if (impact.impactDigest !== request.impactDigest)
          throw new ConflictException('Connector impact changed; review it again');
        const published = await this.definitions.publish(
          request.projectId,
          request.connectorId,
          request,
          request.expectedRevision,
          request.version,
          false
        );
        return { version: published.version.version };
      }
    );
  }

  @Transactional()
  async activate(request: ConnectorActivateRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    return this.localOperation(
      request,
      'activate_custom_connector_version',
      { version: request.version, impactDigest: request.impactDigest },
      async () => {
        const impact = await this.impact(request, request.connectorId, request.version);
        if (impact.impactDigest !== request.impactDigest)
          throw new ConflictException('Connector impact changed; review it again');
        await this.definitions.setActiveVersion(
          request.projectId,
          request.connectorId,
          request.version,
          request,
          request.expectedRevision
        );
        return { version: request.version };
      }
    );
  }

  @Transactional()
  async delete(request: ConnectorDeleteRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    return this.localOperation(
      request,
      'delete_custom_connector',
      { impactDigest: request.impactDigest },
      async () => {
        const impact = await this.impact(request, request.connectorId, null);
        if (impact.impactDigest !== request.impactDigest)
          throw new ConflictException('Connector impact changed; review it again');
        await this.definitions.softDelete(
          request.projectId,
          request.connectorId,
          request.expectedRevision
        );
        return { deleted: true };
      }
    );
  }

  /** No DB transaction remains open during the external test. Unknown receipts never dispatch again. */
  async test(request: ConnectorTestRequest): Promise<ConnectorMutationResult> {
    this.assertActor(request);
    if (
      !Number.isInteger(request.maxRows) ||
      request.maxRows < 1 ||
      request.maxRows > 1000 ||
      !Number.isInteger(request.maxPages) ||
      request.maxPages < 1 ||
      request.maxPages > 50 ||
      !Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 100 ||
      request.timeoutMs > 20_000
    )
      throw new BadRequestException('Invalid test bounds');
    const reserved = await this.reserveTest(request);
    if ('outcome' in reserved) return reserved;
    let state: 'succeeded' | 'failed' = 'failed';
    let rowCount = 0;
    try {
      const output = await this.tests.runTest({
        projectId: request.projectId,
        manifest: reserved.manifest,
        configuration: reserved.configuration,
        node: request.node,
        maxRows: request.maxRows,
        maxPages: request.maxPages,
        timeoutMs: request.timeoutMs,
      });
      state = output.error ? 'failed' : 'succeeded';
      rowCount = Math.min(output.rows.length, request.maxRows);
    } catch {
      /* The fixed diagnostic intentionally drops provider text and row data. */
    }
    await this.completeTest(
      reserved.receiptId,
      request.connectorId,
      request.expectedRevision,
      state,
      rowCount,
      request.projectId,
      request.userId
    );
    return {
      connectorId: request.connectorId,
      revision: request.expectedRevision,
      version: request.version,
      outcome: 'completed',
      test: {
        state,
        rowCount,
        diagnostic: state === 'succeeded' ? 'test_succeeded' : 'test_failed',
      },
    };
  }

  @Transactional()
  private async reserveTest(request: ConnectorTestRequest) {
    const manager = this.definitions.transactionManager;
    const reserved = await this.receipts.reserve(
      manager,
      { ...request, action: 'test_custom_connector', resourceId: request.connectorId },
      {
        expectedRevision: request.expectedRevision,
        version: request.version,
        approvalId: request.approvalId,
        node: request.node,
        maxRows: request.maxRows,
        maxPages: request.maxPages,
        timeoutMs: request.timeoutMs,
      }
    );
    if (!reserved.claimed) return this.recover(request, reserved.receipt);
    await this.definitions.lockReferences(request.projectId);
    const approval = await this.evidence(request, request.approvalId, 'test');
    if (approval.version !== request.version)
      throw new ConflictException('Test approval is for another version');
    const version = await this.definitions.getVersion(
      request.projectId,
      request.connectorId,
      request.version
    );
    if (version.status !== 'draft')
      throw new ConflictException('Test requires the approved saved draft');
    const configuration = await this.protectedValues(request, approval);
    await manager.getRepository(ConnectorAuthoringTestRun).save({
      id: reserved.receipt.id,
      projectId: request.projectId,
      userId: request.userId,
      connectorId: request.connectorId,
      revision: request.expectedRevision,
      version: request.version,
      state: 'unknown',
      rowCount: null,
    });
    await this.receipts.markUnknown(manager, reserved.receipt.id);
    return { receiptId: reserved.receipt.id, manifest: version.manifest, configuration };
  }

  @Transactional()
  private async completeTest(
    receiptId: string,
    connectorId: string,
    revision: number,
    state: 'succeeded' | 'failed',
    rowCount: number,
    projectId: string,
    userId: string
  ) {
    const run = await this.definitions.transactionManager
      .getRepository(ConnectorAuthoringTestRun)
      .findOneByOrFail({ id: receiptId, projectId, userId });
    await this.definitions.transactionManager
      .getRepository(ConnectorAuthoringTestRun)
      .update({ id: receiptId, projectId, userId }, { state, rowCount });
    await this.receipts.complete(this.definitions.transactionManager, receiptId, {
      resourceId: connectorId,
      revision,
      state,
      runId: receiptId,
      versionId: String(run.version),
    });
  }

  async impact(actor: CustomConnectorActor, connectorId: string, version: number | null) {
    this.assertActor(actor);
    const definition = await this.definitions.getById(actor.projectId, connectorId);
    const marts = await this.marts.findByProjectIdAndDefinitionType(
      actor.projectId,
      DataMartDefinitionType.CONNECTOR
    );
    const consumers: { id: string; version: number | null; revision: number }[] = [];
    for (const mart of marts) {
      const source = (
        mart.definition as
          | { connector?: { source?: { name?: string; version?: number } } }
          | undefined
      )?.connector?.source;
      if (source?.name?.toLowerCase() !== definition.name.toLowerCase()) continue;
      const pinned = typeof source.version === 'number' ? source.version : null;
      if (
        version !== null &&
        pinned === null &&
        !(await this.access.canAccessStored(
          actor.userId,
          actor.roles,
          EntityType.DATA_MART,
          mart.id,
          Action.EDIT,
          actor.projectId
        ))
      )
        throw new ForbiddenException('Activation requires edit access to every affected Data Mart');
      consumers.push({ id: mart.id, version: pinned, revision: mart.revision });
    }
    consumers.sort((a, b) => a.id.localeCompare(b.id));
    return {
      impactDigest: digest({ connectorId, revision: definition.revision, version, consumers }),
      referencedConsumers: consumers.length,
      affectedConsumers:
        version === null ? consumers.length : consumers.filter(row => row.version === null).length,
    };
  }

  private async localOperation(
    request: ConnectorOperationRequest,
    action: string,
    intent: Record<string, unknown>,
    write: () => Promise<{ version?: number; deleted?: boolean }>
  ): Promise<ConnectorMutationResult> {
    this.assertRevision(request.expectedRevision);
    const manager = this.definitions.transactionManager;
    const reserved = await this.receipts.reserve(
      manager,
      { ...request, action, resourceId: request.connectorId },
      { expectedRevision: request.expectedRevision, ...intent }
    );
    if (!reserved.claimed) return this.recover(request, reserved.receipt);
    await this.definitions.lockReferences(request.projectId);
    const result = await write();
    const definition = await manager.getRepository(ConnectorDefinition).findOneOrFail({
      where: { id: request.connectorId, projectId: request.projectId },
      withDeleted: true,
    });
    await this.receipts.complete(manager, reserved.receipt.id, {
      resourceId: definition.id,
      revision: definition.revision,
      ...(result.version === undefined ? {} : { versionId: String(result.version) }),
      ...(result.deleted === undefined ? {} : { deleted: result.deleted }),
    });
    return {
      connectorId: definition.id,
      revision: definition.revision,
      outcome: 'completed',
      ...result,
    };
  }

  private async recover(
    actor: CustomConnectorActor & { connectorId?: string },
    receipt: MutationReceipt
  ): Promise<ConnectorMutationResult> {
    this.assertActor(actor);
    if (!receipt.result?.deleted && receipt.result?.resourceId) {
      const current = await this.definitions.transactionManager
        .getRepository(ConnectorDefinition)
        .findOne({
          where: { id: receipt.result.resourceId, projectId: actor.projectId },
          withDeleted: true,
          select: ['id', 'deletedAt'],
        });
      if (!current) throw new NotFoundException('Connector not found');
      if (current.deletedAt)
        return {
          connectorId: current.id,
          revision: receipt.result.revision ?? 0,
          outcome: receipt.status,
          deleted: true,
        };
    }
    const testRun = receipt.result?.runId
      ? await this.definitions.transactionManager
          .getRepository(ConnectorAuthoringTestRun)
          .findOneBy({ id: receipt.result.runId, projectId: actor.projectId, userId: actor.userId })
      : null;
    return {
      connectorId: receipt.result?.resourceId ?? actor.connectorId ?? '',
      revision: receipt.result?.revision ?? 0,
      outcome: receipt.status,
      ...(receipt.result?.versionId ? { version: Number(receipt.result.versionId) } : {}),
      ...(receipt.result?.deleted ? { deleted: true } : {}),
      ...(receipt.result?.state === 'succeeded' || receipt.result?.state === 'failed'
        ? {
            test: {
              state: receipt.result.state,
              rowCount: testRun?.rowCount ?? 0,
              diagnostic:
                receipt.result.state === 'succeeded'
                  ? ('test_succeeded' as const)
                  : ('test_failed' as const),
            },
          }
        : {}),
    };
  }

  private async evidence(
    actor: CustomConnectorActor & { connectorId: string; expectedRevision: number },
    id: string,
    purpose: 'authoring' | 'test'
  ): Promise<ConnectorAuthoringPreparation> {
    const definition = await this.definitions.getById(actor.projectId, actor.connectorId);
    const row = await this.definitions.transactionManager
      .getRepository(ConnectorAuthoringPreparation)
      .findOne({
        where: {
          id,
          projectId: actor.projectId,
          connectorId: actor.connectorId,
          userId: actor.userId,
          purpose,
        },
      });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now())
      throw new ConnectorAppActionRequiredException(purpose);
    if (definition.revision !== actor.expectedRevision || row.revision !== actor.expectedRevision)
      throw new ConflictException(
        'Connector changed; review the current revision in the application'
      );
    const version = await this.definitions.getVersion(
      actor.projectId,
      actor.connectorId,
      row.version
    );
    if (digest(version.manifest) !== row.sourceDigest)
      throw new ConflictException('Prepared version changed');
    return row;
  }

  private async protectedValues(
    actor: CustomConnectorActor,
    evidence: ConnectorAuthoringPreparation
  ): Promise<Record<string, unknown>> {
    const row = await this.definitions.transactionManager
      .getRepository(ConnectorProtectedValues)
      .findOne({
        where: {
          id: evidence.protectedValuesId,
          projectId: actor.projectId,
          userId: actor.userId,
          connectorId: evidence.connectorId,
          purpose: evidence.purpose,
        },
        select: ['id', 'values'],
      });
    if (!row) throw new NotFoundException('Protected values unavailable');
    return row.values;
  }

  private assertSafeDisplayFields(manifest: Record<string, unknown>): void {
    for (const key of ['name', 'title', 'description', 'docUrl']) {
      if (
        manifest[key] !== undefined &&
        manifest[key] !== null &&
        typeof manifest[key] !== 'string'
      )
        throw new BadRequestException(
          'Public connector metadata cannot contain protected references'
        );
    }
  }

  private assertRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new BadRequestException('A current connector revision is required');
  }

  private preparationResult(row: ConnectorAuthoringPreparation): ConnectorPreparationResult {
    return {
      preparationId: row.id,
      revision: row.revision,
      version: row.version,
      manifest: clone(row.safeManifest),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  private assertReferences(
    manifest: Record<string, unknown>,
    values: Record<string, unknown>
  ): void {
    this.restore(manifest, values, manifest);
  }
  private restore(
    manifest: Record<string, unknown>,
    values: Record<string, unknown>,
    reviewedManifest: Record<string, unknown>
  ): Record<string, unknown> {
    const walk = (value: unknown, reviewed: unknown, depth: number): unknown => {
      if (depth > 64) throw new BadRequestException('Manifest nesting too deep');
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value))
        return value.map((item, index) =>
          walk(item, Array.isArray(reviewed) ? reviewed[index] : undefined, depth + 1)
        );
      const object = value as Record<string, unknown>;
      const reviewedObject =
        reviewed && typeof reviewed === 'object' && !Array.isArray(reviewed)
          ? (reviewed as Record<string, unknown>)
          : undefined;
      if ('$protected' in object) {
        if (
          Object.keys(object).length !== 1 ||
          typeof object.$protected !== 'string' ||
          !Object.prototype.hasOwnProperty.call(values, object.$protected)
        )
          throw new BadRequestException('Unknown protected reference');
        // Restoring a credential into a different field can expose it through derived
        // schemas or metadata. App approval permits only its original manifest path.
        if (reviewedObject?.$protected !== object.$protected)
          throw new BadRequestException('Protected reference must remain at its reviewed path');
        return clone(values[object.$protected]);
      }
      return Object.fromEntries(
        Object.entries(object).map(([key, child]) => [
          key,
          walk(
            child,
            reviewedObject && Object.hasOwn(reviewedObject, key) ? reviewedObject[key] : undefined,
            depth + 1
          ),
        ])
      );
    };
    return walk(manifest, reviewedManifest, 0) as Record<string, unknown>;
  }
}
