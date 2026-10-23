export const MCP_CONNECTORS_FACADE = Symbol('MCP_CONNECTORS_FACADE');

export interface McpConnectorsContext {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpConnectorTarget {
  connectorName: string;
  version?: number;
}

export interface McpConnectorSummary {
  id: string | null;
  name: string;
  title: string;
  description: string | null;
  docUrl: string | null;
  isCustom: boolean;
  activeVersion: number | null;
  capabilities: { singleConfiguration: boolean; copySecretsByValue: boolean };
}

export interface McpConnectorParameterItem {
  name: string;
  title?: string;
  description?: string;
  default?: unknown;
  requiredType?: 'string' | 'number' | 'boolean' | 'bool' | 'object' | 'array' | 'date';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  minimum?: number;
  attributes?: string[];
  optionsDependsOn?: string[];
}

export interface McpConnectorParameter extends McpConnectorParameterItem {
  oneOf?: Array<{
    label: string;
    value: string;
    requiredType?: McpConnectorParameterItem['requiredType'];
    attributes?: string[];
    items: Record<string, McpConnectorParameterItem>;
  }>;
}

export interface McpConnectorNode {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  fields?: Array<{ name: string; type?: string; description?: string }>;
}

export interface McpConnectorConfiguration {
  dataMartId: string;
  dataMartTitle: string;
  configurationId: string;
  connectorName: string;
  version: number | null;
  configuration: Record<string, unknown>;
}

export interface McpConnectorPreviewInput {
  connectorName: string;
  configuration?: Record<string, unknown>;
  sourceDataMartId?: string;
  sourceConfigurationId?: string;
}

export interface McpConnectorsFacade {
  listConnectors(ctx: McpConnectorsContext): Promise<McpConnectorSummary[]>;
  getConnectorSpecification(
    ctx: McpConnectorsContext,
    input: McpConnectorTarget
  ): Promise<McpConnectorParameter[]>;
  getConnectorFields(
    ctx: McpConnectorsContext,
    input: McpConnectorTarget
  ): Promise<McpConnectorNode[]>;
  listConnectorConfigurations(
    ctx: McpConnectorsContext,
    input: { connectorName: string }
  ): Promise<McpConnectorConfiguration[]>;
  previewConnectorFields(
    ctx: McpConnectorsContext,
    input: McpConnectorPreviewInput
  ): Promise<McpConnectorNode[]>;
  previewConnectorFieldOptions(
    ctx: McpConnectorsContext,
    input: McpConnectorPreviewInput & { field: string }
  ): Promise<Array<{ value: string; label: string }>>;
}
