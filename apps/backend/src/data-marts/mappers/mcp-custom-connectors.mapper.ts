import { Injectable } from '@nestjs/common';
import { PublicOriginService } from '../../common/config/public-origin.service';
import type {
  CustomConnectorMetadataDto,
  CustomConnectorVersionDto,
} from '../dto/domain/mcp-custom-connectors.dto';
import type { ConnectorDefinition } from '../entities/connector-definition.entity';
import type { ConnectorDefinitionVersionSummary } from '../services/connector/connector-definition.service';

@Injectable()
export class McpCustomConnectorsMapper {
  constructor(private readonly origin: PublicOriginService) {}

  appUrl(projectId: string, connectorId: string): string {
    return new URL(
      `/ui/${encodeURIComponent(projectId)}/connectors/builder/${encodeURIComponent(connectorId)}`,
      this.origin.getPublicOrigin()
    ).toString();
  }

  metadata(
    definition: ConnectorDefinition,
    activeVersion: number | null
  ): CustomConnectorMetadataDto {
    return {
      id: definition.id,
      revision: definition.revision,
      name: definition.name,
      title: definition.title,
      description: definition.description ?? null,
      docUrl: definition.docUrl ?? null,
      activeVersion,
      appUrl: this.appUrl(definition.projectId, definition.id),
    };
  }

  version(
    row: ConnectorDefinitionVersionSummary,
    activeVersion: number | null
  ): CustomConnectorVersionDto {
    return {
      version: row.version,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      active: row.status === 'published' && row.version === activeVersion,
    };
  }
}
