import type { AuthorizationContext } from '../../idp';
import type { ConnectorSpecificationDto } from '../dto/domain/connector-specification.dto';
import type { ConnectorFieldsDto } from '../dto/domain/connector-fields.dto';

export const MCP_CONNECTORS_FACADE = Symbol('MCP_CONNECTORS_FACADE');

export interface McpConnectorDto {
  name: string;
  title: string;
  description: string | null;
  docUrl: string | null;
}

export interface McpConnectorPreviewInput {
  connectorName: string;
  configuration: Record<string, unknown>;
  credentialId?: string;
  dataMartId?: string;
  configurationId?: string;
}

export interface McpConnectorFieldOptionDto {
  value: string;
  label: string;
}

export interface McpConnectorsFacade {
  list(): Promise<McpConnectorDto[]>;
  getSpecification(connectorName: string): Promise<ConnectorSpecificationDto[]>;
  getFields(connectorName: string): Promise<ConnectorFieldsDto[]>;
  previewFields(
    actor: AuthorizationContext,
    input: McpConnectorPreviewInput
  ): Promise<ConnectorFieldsDto[]>;
  previewFieldOptions(
    actor: AuthorizationContext,
    input: McpConnectorPreviewInput & { field: string }
  ): Promise<McpConnectorFieldOptionDto[]>;
}
