import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';

export interface ConnectorSourceConfig {
  name: string;
  configuration: Record<string, unknown>[];
  node: string;
  fields: string[];
}

export interface ConnectorStorageConfig {
  fullyQualifiedName: string;
}

export interface ConnectorConfig {
  source: ConnectorSourceConfig;
  storage: ConnectorStorageConfig;
  info?: ConnectorListItem | null;
}

export interface ConnectorDefinitionConfig {
  connector: ConnectorConfig;
}
