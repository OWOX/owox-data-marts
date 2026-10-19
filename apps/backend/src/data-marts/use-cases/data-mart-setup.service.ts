import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type {
  DataMartSetupActor,
  DataMartSetupDto,
  DataMartSetupImpactDto,
  DataMartSetupImpactRequest,
  DataMartSetupListRequest,
  DataMartSetupRelationshipDto,
  DataMartSetupRequest,
  DataMartSetupSummaryDto,
  DataMartSetupValidationDto,
  DataMartSetupValidationRequest,
} from '../facades/mcp-data-mart-setup.facade';
import { McpDataMartSetupMapper } from '../mappers/mcp-data-mart-setup.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { ReportService } from '../services/report.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { McpSetupDiscoveryMapper } from '../mappers/mcp-setup-discovery.mapper';

/** Stored setup observations; timestamps are deliberately never usable as write revisions. */
@Injectable()
export class DataMartSetupService {
  constructor(
    private readonly marts: DataMartService,
    private readonly access: AccessDecisionService,
    private readonly relationships: DataMartRelationshipService,
    private readonly triggers: ScheduledTriggerService,
    private readonly reports: ReportService,
    private readonly validator: DataMartDefinitionValidatorFacade,
    private readonly mapper: McpDataMartSetupMapper,
    private readonly publicOrigin: PublicOriginService,
    private readonly discoveryMapper: McpSetupDiscoveryMapper
  ) {}

  async list(request: DataMartSetupListRequest) {
    this.assertActor(request);
    const offset = request.offset ?? 0;
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000
    ) {
      throw new BadRequestException('Invalid setup page');
    }
    const candidates = await this.marts.listSetupMetadata(request.projectId);
    const visible: DataMartSetupSummaryDto[] = [];
    for (const item of candidates) {
      if (request.status && item.status !== request.status) continue;
      if (item.projectId !== request.projectId) continue;
      if (await this.allowed(request, item.id, Action.SEE)) {
        visible.push(this.mapper.toSummary(item, this.publicOrigin.getPublicOrigin()));
        if (visible.length > offset + request.limit) break;
      }
    }
    return {
      items: visible.slice(offset, offset + request.limit),
      hasMore: visible.length > offset + request.limit,
    };
  }

  async get(request: DataMartSetupRequest): Promise<DataMartSetupDto> {
    const dataMart = await this.requireDataMart(request, Action.SEE);
    const [
      relationships,
      schedules,
      reportsCount,
      canEdit,
      canDelete,
      canConfigureSharing,
      canManageOwners,
    ] = await Promise.all([
      this.visibleRelationships(request, dataMart),
      this.triggers.getAllByDataMartIdAndProjectId(dataMart.id, request.projectId),
      this.reports.countByDataMartIdAndProjectId(dataMart.id, request.projectId),
      this.allowed(request, dataMart.id, Action.EDIT),
      this.allowed(request, dataMart.id, Action.DELETE),
      this.allowed(request, dataMart.id, Action.CONFIGURE_SHARING),
      this.allowed(request, dataMart.id, Action.MANAGE_OWNERS),
    ]);
    return {
      ...this.mapper.toSummary(dataMart, this.publicOrigin.getPublicOrigin()),
      storage: { id: dataMart.storage.id, type: dataMart.storage.type },
      connectorPreparationId:
        dataMart.connectorPreparedById === request.userId &&
        dataMart.connectorPreparedRevision === dataMart.revision
          ? (dataMart.connectorPreparationId ?? null)
          : null,
      definition: this.mapper.toDefinition(dataMart),
      schema: {
        freshness: !dataMart.schema
          ? 'missing'
          : dataMart.schemaInputRevision === dataMart.revision - 1
            ? 'current'
            : 'stale',
        inputRevision: dataMart.schemaInputRevision ?? null,
        actualizedAt: dataMart.schemaActualizedAt?.toISOString() ?? null,
      },
      access: {
        availableForReporting: dataMart.availableForReporting,
        availableForMaintenance: dataMart.availableForMaintenance,
        technicalOwnerIds: dataMart.technicalOwnerIds,
        businessOwnerIds: dataMart.businessOwnerIds,
        contextIds: dataMart.contextIds,
        canEdit,
        canDelete,
        canConfigureSharing,
        canManageOwners,
      },
      relationships: relationships.items,
      restrictedDependencies: relationships.restricted,
      schedules: schedules.map(schedule => this.mapper.toSchedule(schedule)),
      reportsCount,
    };
  }

  async validate(request: DataMartSetupValidationRequest): Promise<DataMartSetupValidationDto> {
    if (!['static', 'live'].includes(request.mode))
      throw new BadRequestException('Invalid validation mode');
    const dataMart = await this.requireDataMart(
      request,
      request.mode === 'live' ? Action.EDIT : Action.SEE
    );
    const evaluatedModifiedAt = dataMart.modifiedAt.toISOString();
    let valid = false;
    let code: string | null = null;
    try {
      valid = this.mapper.toDefinition(dataMart) !== null;
      if (!valid) code = 'DEFINITION_NOT_FOUND';
    } catch {
      code = 'INVALID_DEFINITION';
    }
    if (valid && !this.supportedTypes(dataMart).includes(dataMart.definitionType!)) {
      valid = false;
      code = 'UNSUPPORTED_DEFINITION_TYPE';
    }
    let currentness: DataMartSetupValidationDto['currentness'] = 'current';
    if (valid && request.mode === 'live') {
      if (
        dataMart.storage.projectId !== request.projectId ||
        !(await this.access.canAccessStored(
          request.userId,
          request.roles,
          EntityType.STORAGE,
          dataMart.storage.id,
          Action.USE,
          request.projectId
        ))
      )
        throw new ForbiddenException('You do not have permission to use this Storage');
      const evaluatedConfiguration = this.configuration(dataMart);
      try {
        const result = await this.validator.validate(dataMart);
        valid = result.valid;
        // Provider messages/details/reasons can contain credentials or arbitrary provider bodies.
        code = valid ? null : 'VALIDATION_FAILED';
      } catch {
        throw new BadGatewayException('Data Mart validation could not be completed');
      }
      const latest = await this.requireDataMart(request, Action.EDIT);
      if (
        dataMart.revision !== latest.revision ||
        evaluatedConfiguration !== this.configuration(latest)
      )
        currentness = 'changed-during-validation';
    }
    return {
      dataMartId: dataMart.id,
      mode: request.mode,
      valid,
      code,
      revision: dataMart.revision,
      evaluatedModifiedAt,
      currentness,
    };
  }

  async impact(request: DataMartSetupImpactRequest): Promise<DataMartSetupImpactDto> {
    const nextDefinitionType =
      (request.definition?.type as DataMartDefinitionType | undefined) ??
      request.nextDefinitionType;
    if (
      request.definition &&
      request.nextDefinitionType &&
      request.definition.type !== request.nextDefinitionType
    )
      throw new BadRequestException('Definition type does not match the proposed definition');
    if (
      !['definition', 'delete'].includes(request.action) ||
      (request.action === 'delete' &&
        (request.nextDefinitionType !== undefined || request.definition !== undefined))
    ) {
      throw new BadRequestException('Invalid Data Mart change');
    }
    const dataMart = await this.requireDataMart(
      request,
      request.action === 'delete' ? Action.DELETE : Action.EDIT
    );
    if (nextDefinitionType) {
      if (!this.supportedTypes(dataMart).includes(nextDefinitionType)) {
        throw new BadRequestException('Definition type is not supported for this Storage');
      }
      if (
        dataMart.definitionType &&
        dataMart.definitionType !== nextDefinitionType &&
        [dataMart.definitionType, nextDefinitionType].includes(DataMartDefinitionType.CONNECTOR)
      ) {
        throw new BadRequestException('Input source type cannot be changed to or from a connector');
      }
    }
    const [relationships, schedules, reportsCount] = await Promise.all([
      this.visibleRelationships(request, dataMart, true),
      this.triggers.getAllByDataMartIdAndProjectId(dataMart.id, request.projectId),
      this.reports.countByDataMartIdAndProjectId(dataMart.id, request.projectId),
    ]);
    const result: DataMartSetupImpactDto = {
      dataMartId: dataMart.id,
      action: request.action,
      nextDefinitionType: nextDefinitionType ?? null,
      revision: dataMart.revision,
      ...(await this.marts.connectorWorkImpact(dataMart.id, request.projectId)),
      confirmation: 'impact-digest',
      impactDigest: '',
      schemaEffect:
        request.action === 'delete' ? 'removed-with-data-mart' : 'requires-actualization',
      credentialEffect:
        request.action === 'delete' ? 'handover-in-use-and-delete-unreferenced' : 'unchanged',
      reportEffect:
        request.action === 'delete' ? 'delete-and-invalidate-cache' : 'may-require-repair',
      scheduleEffect: request.action === 'delete' ? 'delete' : 'retained',
      relationships: relationships.items,
      restrictedDependencies: relationships.restricted,
      reportsCount,
      schedules: schedules.map(schedule => this.mapper.toSchedule(schedule)),
      audience: {
        availableForReporting: dataMart.availableForReporting,
        availableForMaintenance: dataMart.availableForMaintenance,
        contextIds: dataMart.contextIds,
      },
      legacyExternalDeletion:
        request.action === 'delete' &&
        dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      dropsWarehouseTables: false,
    };
    result.impactDigest = createHash('sha256')
      .update(
        JSON.stringify({
          ...result,
          proposedDefinition: request.definition ?? null,
          dependencies: await this.marts.setupDependencyDigest(dataMart.id, request.projectId),
        })
      )
      .digest('hex');
    return result;
  }

  private supportedTypes(dataMart: DataMart): DataMartDefinitionType[] {
    return this.discoveryMapper.toStorage({
      id: dataMart.storage.id,
      title: '',
      type: dataMart.storage.type,
      availableForUse: false,
      availableForMaintenance: false,
    }).capabilities.definitionTypes as DataMartDefinitionType[];
  }

  private configuration(dataMart: DataMart): string {
    return JSON.stringify([
      dataMart.definitionType,
      dataMart.definition,
      dataMart.storage.id,
      dataMart.storage.type,
      dataMart.storage.config,
      dataMart.storage.credentialId,
    ]);
  }

  private assertActor(actor: DataMartSetupActor): void {
    if (!actor.userId?.trim() || !actor.projectId?.trim())
      throw new UnauthorizedException('Setup actor is required');
    if (!actor.roles?.some(role => role === 'admin' || role === 'editor'))
      throw new ForbiddenException('Setup requires an admin or editor');
  }

  private allowed(actor: DataMartSetupActor, id: string, action: Action): Promise<boolean> {
    return this.access.canAccessStored(
      actor.userId,
      actor.roles,
      EntityType.DATA_MART,
      id,
      action,
      actor.projectId
    );
  }

  private async requireDataMart(request: DataMartSetupRequest, action: Action): Promise<DataMart> {
    this.assertActor(request);
    const dataMart = await this.marts.getByIdAndProjectId(request.dataMartId, request.projectId);
    if (
      dataMart.projectId !== request.projectId ||
      !(await this.allowed(request, dataMart.id, action))
    ) {
      throw new ForbiddenException('You do not have permission for this Data Mart action');
    }
    return dataMart;
  }

  private async visibleRelationships(
    request: DataMartSetupRequest,
    dataMart: DataMart,
    includeInbound = false
  ): Promise<{ items: DataMartSetupRelationshipDto[]; restricted: boolean }> {
    const edges: DataMartSetupRelationshipDto[] = [];
    let restricted = false;
    const outgoing = await this.relationships.findBySourceDataMartId(dataMart.id);
    for (const edge of outgoing) {
      if (
        edge.projectId !== request.projectId ||
        edge.targetDataMart.projectId !== request.projectId ||
        !(await this.allowed(request, edge.targetDataMart.id, Action.SEE))
      ) {
        restricted = true;
        continue;
      }
      edges.push({
        id: edge.id,
        sourceDataMartId: dataMart.id,
        targetDataMartId: edge.targetDataMart.id,
        joinConditions: edge.joinConditions.map(condition => ({
          sourceFieldName: condition.sourceFieldName,
          targetFieldName: condition.targetFieldName,
        })),
      });
    }
    if (includeInbound) {
      const sources = await this.relationships.findSourceDataMartIdsByTargetDataMartId(
        dataMart.id,
        request.projectId
      );
      const visibleSources: string[] = [];
      for (const id of sources) {
        const source = await this.marts.getByIdAndProjectId(id, request.projectId);
        if (source.projectId === request.projectId && (await this.allowed(request, id, Action.SEE)))
          visibleSources.push(id);
        else restricted = true;
      }
      const incoming = await this.relationships.findGraphEdgesByProjectIdAndSourceDataMartIds(
        request.projectId,
        visibleSources
      );
      for (const edge of incoming) {
        if (
          edge.targetDataMartId !== dataMart.id ||
          !visibleSources.includes(edge.sourceDataMartId)
        )
          continue;
        edges.push({
          id: edge.id,
          sourceDataMartId: edge.sourceDataMartId,
          targetDataMartId: edge.targetDataMartId,
          joinConditions: edge.joinConditions.map(condition => ({
            sourceFieldName: condition.sourceFieldName,
            targetFieldName: condition.targetFieldName,
          })),
        });
      }
    }
    return { items: edges, restricted };
  }
}
