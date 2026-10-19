import { Transactional } from 'typeorm-transactional';
import {
  ConnectorAuthoringService,
  ConnectorAppActionRequiredException,
} from '../use-cases/connector-authoring.service';
import type {
  ConnectorActivateRequest,
  ConnectorCreateRequest,
  ConnectorDeleteRequest,
  ConnectorDraftRequest,
  ConnectorMetadataRequest,
  ConnectorPublishRequest,
  ConnectorTestRequest,
} from '../dto/domain/connector-authoring.dto';
import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ConnectorAuthoringSchemaDto,
  CustomConnectorActor,
  CustomConnectorConsumerDto,
  CustomConnectorListDto,
  CustomConnectorListRequest,
  CustomConnectorSetupDto,
  CustomConnectorSetupRequest,
  CustomConnectorValidationDto,
  CustomConnectorValidationRequest,
} from '../dto/domain/mcp-custom-connectors.dto';
import { MAX_MANIFEST_SIZE_BYTES } from '../dto/presentation/custom-connector.dto';
import type { ConnectorDefinition as ConnectorSourceDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { McpCustomConnectorsMapper } from '../mappers/mcp-custom-connectors.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorManifestStaticValidationService } from '../services/connector/connector-manifest-static-validation.service';
import { DataMartService } from '../services/data-mart.service';
import type { McpCustomConnectorsFacade } from './mcp-custom-connectors.facade';

@Injectable()
export class McpCustomConnectorsFacadeImpl implements McpCustomConnectorsFacade {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly marts: DataMartService,
    private readonly access: AccessDecisionService,
    private readonly mapper: McpCustomConnectorsMapper,
    private readonly validation: ConnectorManifestStaticValidationService,
    private readonly authoring: ConnectorAuthoringService
  ) {}

  createConnector(request: ConnectorCreateRequest) {
    return this.safeMutation(request, 'create_custom_connector', () =>
      this.authoring.create(request)
    );
  }
  updateMetadata(request: ConnectorMetadataRequest) {
    return this.safeMutation(request, 'update_custom_connector_metadata', () =>
      this.authoring.metadata(request)
    );
  }
  saveDraft(request: ConnectorDraftRequest) {
    return this.safeMutation(request, 'save_custom_connector_draft', () =>
      this.authoring.saveDraft(request)
    );
  }
  testConnector(request: ConnectorTestRequest) {
    return this.safeMutation(request, 'test_custom_connector', () => this.authoring.test(request));
  }
  publishConnector(request: ConnectorPublishRequest) {
    return this.safeMutation(request, 'publish_custom_connector', () =>
      this.authoring.publish(request)
    );
  }
  activateVersion(request: ConnectorActivateRequest) {
    return this.safeMutation(request, 'activate_custom_connector_version', () =>
      this.authoring.activate(request)
    );
  }
  deleteConnector(request: ConnectorDeleteRequest) {
    return this.safeMutation(request, 'delete_custom_connector', () =>
      this.authoring.delete(request)
    );
  }
  getImpact(request: CustomConnectorActor & { connectorId: string; version: number | null }) {
    return this.authoring.impact(request, request.connectorId, request.version);
  }

  private async safeMutation(
    request: CustomConnectorActor & { connectorId?: string; expectedRevision?: number },
    operation: string,
    work: () => Promise<import('../dto/domain/connector-authoring.dto').ConnectorMutationResult>
  ): Promise<import('../dto/domain/connector-authoring.dto').ConnectorMutationResult> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ConnectorAppActionRequiredException)
        return {
          connectorId: request.connectorId ?? '',
          revision: request.expectedRevision ?? 0,
          outcome: 'app_action_required',
          appAction: {
            projectId: request.projectId,
            connectorId: request.connectorId ?? '',
            reason:
              error.purpose === 'test'
                ? 'test_credentials_approval_required'
                : 'manifest_preparation_required',
            appUrl: this.mapper.appUrl(request.projectId, request.connectorId ?? 'new'),
            operation,
          },
        };
      if (error instanceof HttpException)
        throw new HttpException(
          error.getStatus() === 409
            ? 'Connector state or operation intent changed; review the current state'
            : error.getStatus() === 403
              ? 'Connector action is not authorized'
              : error.getStatus() === 404
                ? 'Connector not found'
                : 'Connector request could not be applied',
          error.getStatus()
        );
      throw new InternalServerErrorException('Connector operation could not be completed');
    }
  }

  async getAuthoringSchema(actor: CustomConnectorActor): Promise<ConnectorAuthoringSchemaDto> {
    this.assertActor(actor);
    return {
      format: 'owox-declarative-manifest',
      maxManifestBytes: MAX_MANIFEST_SIZE_BYTES,
      requiredManifestKeys: ['version', 'name', 'baseUrl', 'parameters', 'nodes'],
      sourceName: { pattern: '^[A-Za-z][A-Za-z0-9_]*$', maxLength: 255, mutable: false },
      authenticationTypes: ['apiKey', 'bearer', 'tokenExchange', 'basic', 'selective', 'oauth2'],
      credentials: {
        parameterAttribute: 'SECRET',
        literalAuthValuesAllowed: false,
        secretParameterDefaultsAllowed: false,
      },
      versions: { publishedImmutable: true, draftSaveChangesActiveVersion: false },
      safeEditingAvailable: true,
      approvedTestBindingAvailable: true,
      revisionAvailable: true,
      appUrl: this.mapper.appUrl(actor.projectId, 'new'),
    };
  }

  async listConnectors(request: CustomConnectorListRequest): Promise<CustomConnectorListDto> {
    this.assertActor(request);
    this.assertPage(request.limit, request.offset);
    const definitions = await this.definitions.listByProject(request.projectId);
    if (definitions.some(def => def.projectId !== request.projectId))
      throw new NotFoundException('Connector not found');
    const page = [...definitions]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(request.offset, request.offset + request.limit);
    const activeVersions = await this.definitions.getActiveVersionNumbersByDefId(page);
    return {
      items: page.map(def => this.mapper.metadata(def, activeVersions.get(def.id) ?? null)),
      hasMore: request.offset + request.limit < definitions.length,
    };
  }

  async getConnector(request: CustomConnectorSetupRequest): Promise<CustomConnectorSetupDto> {
    this.assertActor(request);
    this.assertPage(request.versionsLimit, request.versionsOffset);
    const def = await this.getDefinition(request, request.connectorId);
    const versions = await this.definitions.listVersions(request.projectId, def.id);
    const activeVersion = await this.definitions.getActiveVersionNumberForDef(def);
    const impactVersion = request.activationVersion ?? activeVersion;
    const connectorMarts = await this.marts.findByProjectIdAndDefinitionType(
      request.projectId,
      DataMartDefinitionType.CONNECTOR
    );
    const consumers = connectorMarts.filter(mart => {
      const source = (mart.definition as ConnectorSourceDefinition | undefined)?.connector?.source;
      return (
        mart.projectId === request.projectId &&
        source?.name?.toLowerCase() === def.name.toLowerCase()
      );
    });
    let hiddenConsumers = 0;
    let unpinnedConsumers = 0;
    let hasEditAccessToAllUnpinnedConsumers = true;
    const visibleConsumers: CustomConnectorConsumerDto[] = [];
    for (const mart of consumers) {
      const source = (mart.definition as ConnectorSourceDefinition).connector.source;
      const pinnedVersion = typeof source.version === 'number' ? source.version : null;
      const see = await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.DATA_MART,
        mart.id,
        Action.SEE,
        request.projectId
      );
      let canEdit: boolean | null = null;
      if (pinnedVersion === null) {
        unpinnedConsumers++;
        canEdit = await this.access.canAccessStored(
          request.userId,
          request.roles,
          EntityType.DATA_MART,
          mart.id,
          Action.EDIT,
          request.projectId
        );
        hasEditAccessToAllUnpinnedConsumers &&= canEdit;
      }
      if (!see) {
        hiddenConsumers++;
        continue;
      }
      visibleConsumers.push({
        id: mart.id,
        title: mart.title,
        pinnedVersion,
        affectedByActivation: pinnedVersion === null,
        canEdit,
      });
    }
    return {
      connector: this.mapper.metadata(def, activeVersion),
      versions: versions
        .slice(request.versionsOffset, request.versionsOffset + request.versionsLimit)
        .map(row => this.mapper.version(row, activeVersion)),
      hasMoreVersions: request.versionsOffset + request.versionsLimit < versions.length,
      editing: await this.authoring.editing(request, def.id),
      testApproval: await this.authoring.currentTestApproval(request, def.id),
      impact: {
        activationVersion: impactVersion,
        activationDigest:
          impactVersion !== null && hasEditAccessToAllUnpinnedConsumers
            ? (await this.authoring.impact(request, def.id, impactVersion)).impactDigest
            : null,
        deletionDigest: (await this.authoring.impact(request, def.id, null)).impactDigest,
        referencedConsumers: consumers.length,
        unpinnedConsumers,
        pinnedConsumers: consumers.length - unpinnedConsumers,
        hiddenConsumers,
        hasEditAccessToAllUnpinnedConsumers,
        deletionBlockedByReferences: consumers.length > 0,
        visibleConsumers: visibleConsumers.slice(0, 100),
        visibleConsumersTruncated: visibleConsumers.length > 100,
      },
    };
  }

  @Transactional()
  async validateConnector(
    request: CustomConnectorValidationRequest
  ): Promise<CustomConnectorValidationDto> {
    this.assertActor(request);
    if (!Number.isSafeInteger(request.version) || request.version < 1)
      throw new BadRequestException('Invalid connector version');
    await this.definitions.lockReferences(request.projectId);
    const definition = await this.getDefinition(request, request.connectorId);
    const row = await this.definitions.getVersion(
      request.projectId,
      definition.id,
      request.version
    );
    const issues = this.validation.validate(row.manifest, definition.name);
    return {
      connectorId: definition.id,
      revision: definition.revision,
      version: row.version,
      status: row.status,
      valid: issues.length === 0,
      assessment: 'static_known_positions_only',
      issues,
    };
  }

  private async getDefinition(actor: CustomConnectorActor, id: string) {
    const definition = await this.definitions.getById(actor.projectId, id);
    if (definition.projectId !== actor.projectId)
      throw new NotFoundException('Connector not found');
    return definition;
  }

  private assertActor(actor: CustomConnectorActor): void {
    if (!actor.projectId?.trim() || !actor.userId?.trim())
      throw new UnauthorizedException('Actor and project are required');
    if (!actor.roles?.some(role => role === 'admin' || role === 'editor'))
      throw new ForbiddenException('Connector authoring requires editor access');
  }

  private assertPage(limit: number, offset: number): void {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000
    ) {
      throw new BadRequestException('Invalid connector page');
    }
  }
}
