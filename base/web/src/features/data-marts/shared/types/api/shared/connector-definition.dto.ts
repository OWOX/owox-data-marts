export interface ConnectorSourceDto {
  name: string;
  configuration: Record<string, unknown>[];
  node: string;
  fields: string[];
}

export interface ConnectorStorageDto {
  fullyQualifiedName: string;
}

export interface ConnectorDto {
  source: ConnectorSourceDto;
  storage: ConnectorStorageDto;
}

export interface ConnectorDefinitionDto {
  connector: ConnectorDto;
}
