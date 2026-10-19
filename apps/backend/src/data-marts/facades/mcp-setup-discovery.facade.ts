export const MCP_SETUP_DISCOVERY_FACADE = Symbol('MCP_SETUP_DISCOVERY_FACADE');
export interface SetupDiscoveryActor {
  projectId: string;
  userId: string;
  roles: string[];
}
export interface SetupDiscoveryPage {
  limit: number;
  offset?: number;
}
export interface SetupStorageRequest extends SetupDiscoveryActor, SetupDiscoveryPage {}
export interface SetupConnectorRequest extends SetupStorageRequest {
  storageId: string;
}
export interface SetupRequirementsRequest extends SetupDiscoveryActor {
  storageId: string;
  connectorName: string;
  version?: number;
}
export interface SetupResourcesRequest extends SetupConnectorRequest {
  level: 'namespaces' | 'resources';
  namespaceId?: string;
  resourceType?: 'TABLE' | 'VIEW' | 'TABLE_PATTERN';
}
export interface SetupStorageDto {
  id: string;
  title: string;
  type: string;
  availableForUse: boolean;
  availableForMaintenance: boolean;
  capabilities: {
    liveResourceBrowsing: boolean;
    connectorLoad: boolean;
    definitionTypes: Array<'SQL' | 'TABLE' | 'VIEW' | 'TABLE_PATTERN' | 'CONNECTOR'>;
  };
}
export interface SetupConnectorDto {
  name: string;
  title: string;
  kind: 'built-in' | 'custom';
  activeVersion: number | null;
  publishedVersions: number[];
  versionsTruncated: boolean;
}
export interface SetupResourceDto {
  id: string;
  label?: string;
  groupId?: string;
  type?: 'TABLE' | 'VIEW';
  fullyQualifiedName?: string;
  location?: string;
  locationMismatch?: boolean;
}
export interface SetupParameterDto {
  path: string;
  required: boolean;
  type: string;
  dynamicOptions: boolean;
  minimum?: number;
}
export interface SetupAuthorizationRequirementDto {
  path: string;
  required: boolean;
  method: 'credential' | 'oauth';
}
export interface SetupRequirementsDto {
  connector: SetupConnectorDto;
  parameters: SetupParameterDto[];
  authorization: SetupAuthorizationRequirementDto[];
  capabilities: { singleConfiguration: boolean; copySecretsByValue: boolean };
  limits: {
    minimumConfigurations: number;
    maximumConfigurations: number | null;
    minimumFields: number;
  };
  credentialState: 'not_checked';
  appUrl: string;
}
export interface SetupStorageListDto {
  items: SetupStorageDto[];
  hasMore: boolean;
}
export interface SetupConnectorListDto {
  items: SetupConnectorDto[];
  hasMore: boolean;
}
export interface SetupResourceListDto {
  source: 'live';
  items: SetupResourceDto[];
  hasMore: boolean;
}
export interface McpSetupDiscoveryFacade {
  listStorages(request: SetupStorageRequest): Promise<SetupStorageListDto>;
  listStorageResources(request: SetupResourcesRequest): Promise<SetupResourceListDto>;
  listConnectors(request: SetupConnectorRequest): Promise<SetupConnectorListDto>;
  getConnectorRequirements(request: SetupRequirementsRequest): Promise<SetupRequirementsDto>;
}
