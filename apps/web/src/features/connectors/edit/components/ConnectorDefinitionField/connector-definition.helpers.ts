import { DataStorageType } from '../../../../data-storage';
import { type ConnectorDefinitionConfig } from '../../../../data-marts/edit/model/types/connector-definition-config.ts';

export const getStorageDisplayName = (type: DataStorageType) => {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'Google BigQuery';
    case DataStorageType.AWS_ATHENA:
      return 'AWS Athena';
    default:
      return type;
  }
};

export const isConnectorDefinition = (value: ConnectorDefinitionConfig) => {
  return typeof value === 'object' && 'connector' in value;
};

export const isConnectorConfigured = (value: ConnectorDefinitionConfig): boolean => {
  if (!isConnectorDefinition(value)) {
    return false;
  }

  const { source, storage } = value.connector;

  const hasValidSource =
    Boolean(source.name) &&
    Boolean(source.configuration) &&
    source.configuration.length > 0 &&
    Boolean(source.node) &&
    Boolean(source.fields) &&
    source.fields.length > 0;

  const hasValidStorage =
    Boolean(storage.fullyQualifiedName) && storage.fullyQualifiedName.split('.').length === 2;

  return hasValidSource && hasValidStorage;
};
