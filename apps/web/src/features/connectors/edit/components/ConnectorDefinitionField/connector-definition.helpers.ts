import { type ConnectorDefinitionConfig } from '../../../../data-marts/edit/model/types/connector-definition-config.ts';

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

  const parts = storage.fullyQualifiedName.split('.');
  const hasValidStorage = parts.length === 2 || parts.length === 3;

  return hasValidSource && hasValidStorage;
};
