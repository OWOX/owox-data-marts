import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@owox/idp-protocol';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { isConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { McpConnectorsMapper } from '../mappers/mcp-connectors.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorFieldOptionsPreviewService } from '../services/connector/connector-field-options-preview.service';
import { ConnectorFieldsPreviewService } from '../services/connector/connector-fields-preview.service';
import {
  ConnectorSecretService,
  SecretFieldsCache,
} from '../services/connector/connector-secret.service';
import { ConnectorService } from '../services/connector/connector.service';
import { DataMartService } from '../services/data-mart.service';
import type {
  McpConnectorConfiguration,
  McpConnectorNode,
  McpConnectorParameter,
  McpConnectorPreviewInput,
  McpConnectorSummary,
  McpConnectorTarget,
  McpConnectorsContext,
  McpConnectorsFacade,
} from './mcp-connectors.facade';

@Injectable()
export class McpConnectorsFacadeImpl implements McpConnectorsFacade {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly definitions: ConnectorDefinitionService,
    private readonly dataMarts: DataMartService,
    private readonly access: AccessDecisionService,
    private readonly secrets: ConnectorSecretService,
    private readonly fieldsPreview: ConnectorFieldsPreviewService,
    private readonly optionsPreview: ConnectorFieldOptionsPreviewService,
    private readonly mapper: McpConnectorsMapper
  ) {}

  async listConnectors(ctx: McpConnectorsContext): Promise<McpConnectorSummary[]> {
    this.requireRole(ctx, 'viewer');
    const [bundled, custom] = await Promise.all([
      this.connectorService.getAvailableConnectors(),
      this.definitions.listByProject(ctx.projectId),
    ]);
    const activeVersions = await this.definitions.getActiveVersionNumbersByDefId(custom);
    const bundledNames = new Set(bundled.map(connector => connector.name.toLowerCase()));
    const result = bundled.map(connector =>
      this.mapper.toSummary(connector, {
        id: null,
        isCustom: false,
        activeVersion: null,
        capabilities: this.connectorService.getConnectorCapabilities(connector.name),
      })
    );

    for (const connector of custom) {
      const activeVersion = activeVersions.get(connector.id);
      if (activeVersion === undefined || bundledNames.has(connector.name.toLowerCase())) continue;
      try {
        // Resolution also verifies that the selected version is published and usable.
        const capabilities = await this.connectorService.resolveConnectorCapabilities(
          ctx.projectId,
          connector.name,
          activeVersion
        );
        result.push(
          this.mapper.toSummary(connector, {
            id: connector.id,
            isCustom: true,
            activeVersion,
            capabilities,
          })
        );
      } catch (error) {
        if (!(error instanceof BadRequestException) && !(error instanceof NotFoundException))
          throw error;
      }
    }
    return result;
  }

  async getConnectorSpecification(
    ctx: McpConnectorsContext,
    input: McpConnectorTarget
  ): Promise<McpConnectorParameter[]> {
    this.requireRole(ctx, 'viewer');
    const specification = await this.connectorService.resolveConnectorSpecification(
      ctx.projectId,
      input.connectorName,
      input.version
    );
    return this.mapper.toSpecification(specification);
  }

  async getConnectorFields(
    ctx: McpConnectorsContext,
    input: McpConnectorTarget
  ): Promise<McpConnectorNode[]> {
    this.requireRole(ctx, 'viewer');
    const fields = await this.connectorService.resolveConnectorFieldsSchema(
      ctx.projectId,
      input.connectorName,
      input.version
    );
    return this.mapper.toNodes(fields);
  }

  async listConnectorConfigurations(
    ctx: McpConnectorsContext,
    input: { connectorName: string }
  ): Promise<McpConnectorConfiguration[]> {
    this.requireRole(ctx, 'editor');
    const dataMarts = await this.dataMarts.findByProjectIdAndDefinitionType(
      ctx.projectId,
      DataMartDefinitionType.CONNECTOR
    );
    const matching = dataMarts.filter(
      dataMart =>
        dataMart.definition &&
        isConnectorDefinition(dataMart.definition) &&
        dataMart.definition.connector.source.name === input.connectorName
    );
    if (matching.length === 0) return [];
    const permissions = await this.access.canAccessMany(
      ctx.userId,
      ctx.roles,
      EntityType.DATA_MART,
      matching.map(dataMart => dataMart.id),
      Action.EDIT,
      ctx.projectId
    );
    const secretFieldsCache: SecretFieldsCache = new Map();
    const configurations = await Promise.all(
      matching
        .filter(dataMart => permissions.get(dataMart.id) === true)
        .map(async dataMart => {
          const masked = await this.secrets.mask(
            ctx.projectId,
            dataMart.definition as ConnectorDefinition,
            secretFieldsCache
          );
          return masked ? this.mapper.toConfigurations(dataMart, masked) : [];
        })
    );
    return configurations.flat();
  }

  async previewConnectorFields(
    ctx: McpConnectorsContext,
    input: McpConnectorPreviewInput
  ): Promise<McpConnectorNode[]> {
    this.requireRole(ctx, 'editor');
    const configuration = await this.resolvePreviewConfiguration(ctx, input);
    const fields = await this.fieldsPreview.run(
      { ...ctx, roles: ctx.roles as Role[] },
      input.connectorName,
      configuration
    );
    return this.mapper.toNodes(fields);
  }

  async previewConnectorFieldOptions(
    ctx: McpConnectorsContext,
    input: McpConnectorPreviewInput & { field: string }
  ): Promise<Array<{ value: string; label: string }>> {
    this.requireRole(ctx, 'editor');
    const configuration = await this.resolvePreviewConfiguration(ctx, input);
    const options = await this.optionsPreview.run(
      { ...ctx, roles: ctx.roles as Role[] },
      input.connectorName,
      input.field,
      configuration
    );
    return options.map(option => ({ value: option.value, label: option.label }));
  }

  private async resolvePreviewConfiguration(
    ctx: McpConnectorsContext,
    input: McpConnectorPreviewInput
  ): Promise<Record<string, unknown>> {
    if (input.sourceDataMartId === undefined && input.sourceConfigurationId === undefined) {
      return input.configuration ?? {};
    }
    if (!input.sourceDataMartId?.trim() || !input.sourceConfigurationId?.trim()) {
      throw new BadRequestException(
        'sourceDataMartId and sourceConfigurationId must be provided together'
      );
    }
    const source = await this.dataMarts.getByIdAndProjectId(input.sourceDataMartId, ctx.projectId);
    const canEdit = await this.access.canAccess(
      ctx.userId,
      ctx.roles,
      EntityType.DATA_MART,
      source.id,
      Action.EDIT,
      ctx.projectId
    );
    if (!canEdit) throw new ForbiddenException('The source Data Mart requires edit access');
    if (
      source.definitionType !== DataMartDefinitionType.CONNECTOR ||
      !source.definition ||
      !isConnectorDefinition(source.definition) ||
      source.definition.connector.source.name !== input.connectorName
    ) {
      throw new BadRequestException('The source Data Mart must use the selected connector');
    }
    const configuration = source.definition.connector.source.configuration.find(
      item => item._id === input.sourceConfigurationId
    );
    if (!configuration) throw new NotFoundException('The source configuration was not found');
    return {
      ...structuredClone(configuration),
      ...this.mapper.toPublicConfiguration(input.configuration ?? {}),
      _copiedFrom: { dataMartId: source.id, configId: input.sourceConfigurationId },
    };
  }

  private requireRole(ctx: McpConnectorsContext, role: 'viewer' | 'editor'): void {
    if (!ctx.userId?.trim() || !ctx.projectId?.trim() || !satisfiesRole(ctx.roles, role)) {
      throw new ForbiddenException(`An authenticated project ${role} is required`);
    }
  }
}
