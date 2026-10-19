import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';
import { z } from 'zod';
import type { DataMartModelPreviewRequest } from '../dto/domain/data-mart-model.dto';
import type {
  DataMartModelAccessRequest,
  DataMartModelAudienceDto,
  DataMartModelMutationDto,
  DataMartModelMutationRequest,
  DataMartModelRelationshipsRequest,
  DataMartModelSchemaRequest,
} from '../dto/domain/data-mart-model-mutation.dto';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';
import { UpdateDataMartOwnersCommand } from '../dto/domain/update-data-mart-owners.command';
import {
  BlendedFieldsConfigSchema,
  ALIAS_SEGMENT_REGEX,
} from '../dto/schemas/blended-fields-config.schema';
import { DataMart } from '../entities/data-mart.entity';
import { ContextReferenceGuard } from '../entities/context-reference-guard.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { flattenSchemaFields } from '../services/blendable-schema.service';
import { calculatedFieldsOf } from '../calculated-fields/calculated-field.utils';
import { parseFormulaReferences } from '../calculated-fields/formula-reference';
import { ActualizeDataMartSchemaService } from './actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from './update-data-mart-schema.service';
import { CreateDataMartRelationshipService } from './create-data-mart-relationship.service';
import { UpdateDataMartRelationshipService } from './update-data-mart-relationship.service';
import { DeleteDataMartRelationshipService } from './delete-data-mart-relationship.service';
import { UpdateBlendedFieldsConfigService } from './update-blended-fields-config.service';
import { UpdateDataMartOwnersService } from './update-data-mart-owners.service';
import { UpdateAvailabilityService } from './update-availability.service';

const join = z
  .object({
    sourceFieldName: z
      .string()
      .min(1)
      .regex(/^[^.]+$/),
    targetFieldName: z
      .string()
      .min(1)
      .regex(/^[^.]+$/),
  })
  .strict();
const alias = z.string().min(1).max(255).regex(ALIAS_SEGMENT_REGEX);
const changesSchema = z
  .array(
    z.discriminatedUnion('action', [
      z
        .object({
          action: z.literal('create'),
          targetDataMartId: z.string().min(1),
          targetAlias: alias,
          joinConditions: z.array(join),
          description: z.string().max(10000).optional(),
        })
        .strict(),
      z
        .object({
          action: z.literal('update'),
          relationshipId: z.string().min(1),
          targetAlias: alias.optional(),
          joinConditions: z.array(join).optional(),
          description: z.string().max(10000).nullable().optional(),
        })
        .strict(),
      z.object({ action: z.literal('remove'), relationshipId: z.string().min(1) }).strict(),
    ])
  )
  .max(100);
const accessParts = z.object({
  owners: z
    .object({
      businessOwnerIds: z.array(z.string().min(1)).max(100),
      technicalOwnerIds: z.array(z.string().min(1)).max(100),
    })
    .strict()
    .optional(),
  availability: z
    .object({ availableForReporting: z.boolean(), availableForMaintenance: z.boolean() })
    .strict()
    .optional(),
});

@Injectable()
export class DataMartModelMutationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly marts: DataMartService,
    private readonly access: AccessDecisionService,
    private readonly actualizer: ActualizeDataMartSchemaService,
    private readonly schemaWriter: UpdateDataMartSchemaService,
    private readonly relationships: DataMartRelationshipService,
    private readonly createRelationship: CreateDataMartRelationshipService,
    private readonly updateRelationship: UpdateDataMartRelationshipService,
    private readonly deleteRelationship: DeleteDataMartRelationshipService,
    private readonly output: UpdateBlendedFieldsConfigService,
    private readonly owners: UpdateDataMartOwnersService,
    private readonly availability: UpdateAvailabilityService
  ) {}

  async actualizeSchema(request: DataMartModelMutationRequest): Promise<DataMartModelMutationDto> {
    const before = await this.require(request, Action.EDIT);
    await this.storage(request, before.storage.id);
    const saved = await this.actualizer.run(
      new ActualizeDataMartSchemaCommand(
        request.dataMartId,
        request.projectId,
        request.userId,
        request.roles,
        request.expectedRevision
      )
    );
    return {
      state: 'completed',
      dataMartId: saved.id,
      revision: saved.revision,
      schema: { inputRevision: request.expectedRevision, freshness: 'current' },
    };
  }

  async updateSchema(request: DataMartModelSchemaRequest): Promise<DataMartModelMutationDto> {
    const before = await this.require(request, Action.EDIT);
    if (
      !before.schema ||
      before.schemaInputRevision == null ||
      before.schemaInputRevision !== before.revision - 1
    )
      throw new ConflictException(
        'Schema refresh required: actualize the schema for the current Data Mart definition before editing fields'
      );
    await this.storage(request, before.storage.id);
    const saved = await this.schemaWriter.run(
      new UpdateDataMartSchemaCommand(
        request.dataMartId,
        request.projectId,
        request.schema,
        request.userId,
        request.roles,
        request.expectedRevision
      )
    );
    return {
      state: 'completed',
      dataMartId: saved.id,
      revision: saved.revision,
      warnings: saved.warnings,
      schema: {
        inputRevision: saved.schemaInputRevision ?? null,
        freshness: !saved.schema
          ? 'missing'
          : saved.schemaInputRevision === saved.revision - 1
            ? 'current'
            : 'stale',
      },
    };
  }

  async setRelationships(
    request: DataMartModelRelationshipsRequest
  ): Promise<DataMartModelMutationDto> {
    await this.require(request, Action.EDIT);
    const changes = changesSchema.parse(request.changes);
    const config =
      request.blendedFieldsConfig === undefined
        ? undefined
        : request.blendedFieldsConfig === null
          ? null
          : BlendedFieldsConfigSchema.parse(request.blendedFieldsConfig);
    if (!changes.length && config === undefined)
      throw new BadRequestException('Supply changes or output configuration');
    return runInTransaction(async () => {
      await this.marts.lockConfigurationReferences(request.projectId);
      const source = await this.require(request, Action.EDIT);
      await this.storage(request, source.storage.id);
      const existing = await this.relationships.findBySourceDataMartId(source.id);
      const final = new Map(
        existing.map(item => [item.id, Object.assign(new DataMartRelationship(), item)])
      );
      const touched = new Set<string>();
      const renames = new Map<string, string>();
      for (const [index, change] of changes.entries()) {
        if (change.action !== 'create' && touched.has(change.relationshipId))
          throw new BadRequestException('A relationship may be changed only once');
        if (change.action !== 'create') touched.add(change.relationshipId);
        const old = change.action === 'create' ? undefined : final.get(change.relationshipId);
        if (change.action !== 'create' && !old)
          throw new BadRequestException('Relationship does not belong to this Data Mart');
        const targetId =
          change.action === 'create' ? change.targetDataMartId : old!.targetDataMart.id;
        const target = await this.require({ ...request, dataMartId: targetId }, Action.EDIT, false);
        this.relationships.validateNoSelfReference(source.id, target.id);
        this.relationships.validateSameStorage(source.storage.id, target.storage.id);
        if (change.action === 'remove') final.delete(change.relationshipId);
        else {
          const next = Object.assign(new DataMartRelationship(), old, change, {
            targetDataMart: target,
            sourceDataMart: source,
          });
          this.relationships.validateJoinFieldTypes(
            source.schema,
            target.schema,
            next.joinConditions
          );
          if (old && old.targetAlias !== next.targetAlias)
            renames.set(old.targetAlias, next.targetAlias);
          final.set(change.action === 'create' ? `new:${index}` : change.relationshipId, next);
        }
      }
      const aliases = [...final.values()].map(item => item.targetAlias);
      if (new Set(aliases).size !== aliases.length)
        throw new BadRequestException('Relationship aliases must be unique');
      // Match REST alias cascading when the caller retains its output config.
      const effectiveConfig = config === undefined ? source.blendedFieldsConfig : config;
      const rewrite = (path: string) => {
        const [first, ...rest] = path.split('.');
        return [renames.get(first) ?? first, ...rest].join('.');
      };
      for (const field of calculatedFieldsOf(source.schema?.fields ?? [])) {
        for (const ref of parseFormulaReferences(field.calculated.formula)) {
          if (ref.path)
            await this.resolvePath(
              request,
              source,
              [...final.values()],
              rewrite(ref.path),
              ref.field
            );
        }
      }
      for (const item of effectiveConfig?.sources ?? []) {
        const path = config === undefined ? rewrite(item.path) : item.path;
        const target = await this.resolvePath(request, source, [...final.values()], path);
        for (const name of Object.keys(item.fields ?? {})) {
          if (
            !flattenSchemaFields(target.schema?.fields ?? [], '', true).some(
              field => field.name === name
            )
          )
            throw new BadRequestException('Output field is not in the target schema');
        }
      }
      // Every local dependency and proposed field was checked before the first write.
      await this.marts.advanceConfigurationRevision(
        this.dataSource.manager,
        source.id,
        request.projectId,
        request.expectedRevision
      );
      // Temporary aliases make a valid final change set independent of intermediate collisions.
      // Existing rename cascading moves each formula/output path with its original relationship.
      for (const change of changes) {
        if (change.action !== 'update' || change.targetAlias === undefined) continue;
        const previous = existing.find(item => item.id === change.relationshipId)!;
        if (change.targetAlias === previous.targetAlias) continue;
        await this.updateRelationship.run(
          new UpdateRelationshipCommand(
            change.relationshipId,
            source.id,
            request.projectId,
            request.userId,
            request.roles,
            `mcp_${randomUUID().replace(/-/g, '')}`
          )
        );
      }
      const ordered = [
        ...changes.filter(change => change.action === 'remove'),
        ...changes.filter(change => change.action === 'update'),
        ...changes.filter(change => change.action === 'create'),
      ];
      for (const change of ordered) {
        if (change.action === 'create')
          await this.createRelationship.run(
            new CreateRelationshipCommand(
              source.id,
              change.targetDataMartId,
              change.targetAlias,
              change.joinConditions,
              request.projectId,
              request.userId,
              request.roles,
              change.description
            )
          );
        else if (change.action === 'update')
          await this.updateRelationship.run(
            new UpdateRelationshipCommand(
              change.relationshipId,
              source.id,
              request.projectId,
              request.userId,
              request.roles,
              change.targetAlias,
              change.joinConditions,
              change.description
            )
          );
        else
          await this.deleteRelationship.run(
            new DeleteRelationshipCommand(
              change.relationshipId,
              source.id,
              request.projectId,
              request.userId,
              request.roles
            )
          );
      }
      if (config !== undefined)
        await this.output.run(
          new UpdateBlendedFieldsConfigCommand(
            source.id,
            request.projectId,
            config,
            request.userId,
            request.roles
          )
        );
      const saved = await this.marts.getByIdAndProjectId(source.id, request.projectId);
      return { state: 'completed' as const, dataMartId: source.id, revision: saved.revision };
    });
  }

  async setAccess(request: DataMartModelAccessRequest): Promise<DataMartModelMutationDto> {
    this.actor(request);
    if (request.mode !== 'inspect' && request.mode !== 'apply')
      throw new BadRequestException('Invalid access mode');
    const parts = accessParts.parse(request);
    if (!parts.owners && !parts.availability)
      throw new BadRequestException('Supply owners or availability');
    const inspect = async () => {
      // Check every requested action before the first configuration write.
      let current: DataMart | undefined;
      if (parts.owners) current = await this.require(request, Action.MANAGE_OWNERS);
      if (parts.availability) current = await this.require(request, Action.CONFIGURE_SHARING);
      const audience = this.audience(current!);
      const proposed = {
        ...audience,
        ...(parts.owners
          ? {
              businessOwnerIds: [...new Set(parts.owners.businessOwnerIds)].sort(),
              technicalOwnerIds: [...new Set(parts.owners.technicalOwnerIds)].sort(),
            }
          : {}),
        ...parts.availability,
      };
      const guard = await this.dataSource.manager
        .getRepository(ContextReferenceGuard)
        .findOneBy({ projectId: request.projectId });
      const digest = createHash('sha256')
        .update(
          JSON.stringify({
            action: 'set_data_mart_access',
            projectId: request.projectId,
            userId: request.userId,
            dataMartId: request.dataMartId,
            revision: current!.revision,
            contextRevision: guard?.revision ?? 0,
            audience,
            proposed,
          })
        )
        .digest('hex');
      return { current: current!, audience, proposed, digest };
    };
    if (request.mode === 'inspect') {
      const value = await inspect();
      return {
        state: 'inspection',
        dataMartId: request.dataMartId,
        revision: value.current.revision,
        currentAudience: value.audience,
        proposedAudience: value.proposed,
        impactDigest: value.digest,
      };
    }
    return runInTransaction(async () => {
      await this.marts.lockConfigurationReferences(request.projectId);
      const value = await inspect();
      if (!request.impactDigest || value.digest !== request.impactDigest)
        throw new ConflictException(
          'Access impact changed; inspect again and obtain user authorization'
        );
      await this.marts.advanceConfigurationRevision(
        this.dataSource.manager,
        request.dataMartId,
        request.projectId,
        request.expectedRevision
      );
      // Apply sharing first because an owner change can remove the actor's authority.
      if (parts.availability)
        await this.availability.updateDataMartSharing(
          request.dataMartId,
          request.projectId,
          request.userId,
          request.roles,
          parts.availability.availableForReporting,
          parts.availability.availableForMaintenance
        );
      if (parts.owners)
        await this.owners.run(
          new UpdateDataMartOwnersCommand(
            request.dataMartId,
            request.projectId,
            parts.owners.businessOwnerIds,
            parts.owners.technicalOwnerIds,
            request.userId,
            request.roles
          )
        );
      // Only the committed ID/revision is returned; self-removal cannot leak a new entity read.
      const saved = await this.dataSource.manager.getRepository(DataMart).findOneOrFail({
        where: { id: request.dataMartId, projectId: request.projectId },
        select: { id: true, revision: true },
        loadEagerRelations: false,
      });
      return {
        state: 'completed' as const,
        dataMartId: request.dataMartId,
        revision: saved.revision,
      };
    });
  }

  private async resolvePath(
    request: DataMartModelMutationRequest,
    source: DataMart,
    roots: DataMartRelationship[],
    path: string,
    field?: string
  ): Promise<DataMart> {
    let current = source;
    let edges = roots;
    for (const segment of path.split('.')) {
      const edge = edges.find(item => item.targetAlias === segment);
      if (!edge)
        throw new BadRequestException(
          'Output or formula refers to an unavailable relationship path'
        );
      current = await this.require(
        { ...request, dataMartId: edge.targetDataMart.id },
        Action.SEE,
        false
      );
      this.relationships.validateSameStorage(source.storage.id, current.storage.id);
      edges = await this.relationships.findBySourceDataMartId(current.id);
    }
    if (
      field &&
      !flattenSchemaFields(current.schema?.fields ?? [], '', true).some(item => item.name === field)
    )
      throw new BadRequestException('Formula refers to an unavailable target field');
    return current;
  }
  private audience(mart: DataMart): DataMartModelAudienceDto {
    return {
      businessOwnerIds: [...mart.businessOwnerIds].sort(),
      technicalOwnerIds: [...mart.technicalOwnerIds].sort(),
      contextIds: [...mart.contextIds].sort(),
      availableForReporting: mart.availableForReporting,
      availableForMaintenance: mart.availableForMaintenance,
    };
  }
  private actor(request: DataMartModelPreviewRequest) {
    if (
      !request.userId?.trim() ||
      !request.projectId?.trim() ||
      !request.roles?.some(role => role === 'admin' || role === 'editor')
    )
      throw new ForbiddenException('Current Setup actor and edit role are required');
  }
  private async require(
    request: DataMartModelMutationRequest,
    action: Action,
    checkRevision = true
  ): Promise<DataMart> {
    this.actor(request);
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1)
      throw new BadRequestException('expectedRevision must be a positive safe integer');
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
    if (checkRevision && mart.revision !== request.expectedRevision)
      throw new ConflictException('Data Mart configuration changed');
    return mart;
  }
  private async storage(request: DataMartModelPreviewRequest, storageId: string) {
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
}
