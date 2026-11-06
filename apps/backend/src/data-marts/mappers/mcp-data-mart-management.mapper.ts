import { Injectable } from '@nestjs/common';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import type { DataMartDto } from '../dto/domain/data-mart.dto';
import type { DataMartListItemDto } from '../dto/domain/data-mart-list-item.dto';
import type { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import type {
  McpDataMartSetupDto,
  McpDataMartSummaryDto,
} from '../facades/mcp-data-mart-management.facade';
import { McpConnectorConfigurationService } from '../services/connector/mcp-connector-configuration.service';

@Injectable()
export class McpDataMartManagementMapper {
  constructor(
    private readonly credentials: SourceCredentialBindingService,
    private readonly configuration: McpConnectorConfigurationService
  ) {}

  toSummary(dto: DataMartDto | DataMartListItemDto): McpDataMartSummaryDto {
    return {
      id: dto.id,
      title: dto.title,
      status: dto.status,
      definitionType: dto.definitionType ?? null,
      createdAt: dto.createdAt.toISOString(),
      modifiedAt: dto.modifiedAt.toISOString(),
    };
  }

  async toSetup(dto: DataMartDto): Promise<McpDataMartSetupDto> {
    const definition = await this.toDefinition(dto);
    return {
      ...this.toSummary(dto),
      description: dto.description ?? null,
      icon: dto.icon,
      storage: { id: dto.storage.id, title: dto.storage.title, type: dto.storage.type },
      definition,
      definitionReadError:
        dto.definition && !definition
          ? 'The saved definition could not be read safely. Repair the connector in OWOX before replacing its definition.'
          : null,
      schema: dto.schema ?? null,
      businessOwnerIds: dto.businessOwnerUsers.map(user => user.userId),
      technicalOwnerIds: dto.technicalOwnerUsers.map(user => user.userId),
      contexts: dto.contexts.map(context => ({ id: context.id, name: context.name })),
      availableForReporting: dto.availableForReporting,
      availableForMaintenance: dto.availableForMaintenance,
    };
  }

  private async toDefinition(dto: DataMartDto): Promise<DataMartDefinition | null> {
    const definition = dto.definition;
    if (!definition) return null;
    if (isConnectorDefinition(definition)) {
      const { source, storage } = definition.connector;
      const bound = await this.credentials.boundCredentialIds(dto.projectId, dto.id);
      const configuration = await this.configuration.toPublicConfigurations(
        dto.projectId,
        source.name,
        source.configuration.map(item => ({
          ...item,
          ...(bound.get(item._id as string)
            ? { _credential_id: bound.get(item._id as string) }
            : {}),
        })),
        source.version
      );
      // Never return a partial configuration list: a save would remove the unreadable items.
      if (configuration === null) return null;
      return {
        connector: {
          source: {
            name: source.name,
            node: source.node,
            fields: source.fields,
            configuration,
            ...(source.version === undefined ? {} : { version: source.version }),
          },
          storage: { fullyQualifiedName: storage.fullyQualifiedName },
        },
      };
    }
    if (isSqlDefinition(definition)) return { sqlQuery: definition.sqlQuery };
    if (isTableDefinition(definition) || isViewDefinition(definition))
      return { fullyQualifiedName: definition.fullyQualifiedName };
    if (isTablePatternDefinition(definition)) return { pattern: definition.pattern };
    return null;
  }
}
