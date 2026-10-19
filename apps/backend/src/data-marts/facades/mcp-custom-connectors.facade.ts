import type {
  ConnectorActivateRequest,
  ConnectorCreateRequest,
  ConnectorDeleteRequest,
  ConnectorDraftRequest,
  ConnectorMetadataRequest,
  ConnectorMutationResult,
  ConnectorPublishRequest,
  ConnectorTestRequest,
} from '../dto/domain/connector-authoring.dto';
import type {
  ConnectorAuthoringSchemaDto,
  CustomConnectorActor,
  CustomConnectorListDto,
  CustomConnectorListRequest,
  CustomConnectorSetupDto,
  CustomConnectorSetupRequest,
  CustomConnectorValidationDto,
  CustomConnectorValidationRequest,
} from '../dto/domain/mcp-custom-connectors.dto';

export const MCP_CUSTOM_CONNECTORS_FACADE = Symbol('MCP_CUSTOM_CONNECTORS_FACADE');
export interface McpCustomConnectorsFacade {
  createConnector(request: ConnectorCreateRequest): Promise<ConnectorMutationResult>;
  updateMetadata(request: ConnectorMetadataRequest): Promise<ConnectorMutationResult>;
  saveDraft(request: ConnectorDraftRequest): Promise<ConnectorMutationResult>;
  testConnector(request: ConnectorTestRequest): Promise<ConnectorMutationResult>;
  publishConnector(request: ConnectorPublishRequest): Promise<ConnectorMutationResult>;
  activateVersion(request: ConnectorActivateRequest): Promise<ConnectorMutationResult>;
  deleteConnector(request: ConnectorDeleteRequest): Promise<ConnectorMutationResult>;
  getImpact(
    request: CustomConnectorActor & { connectorId: string; version: number | null }
  ): Promise<{ impactDigest: string; referencedConsumers: number; affectedConsumers: number }>;

  getAuthoringSchema(actor: CustomConnectorActor): Promise<ConnectorAuthoringSchemaDto>;
  listConnectors(request: CustomConnectorListRequest): Promise<CustomConnectorListDto>;
  getConnector(request: CustomConnectorSetupRequest): Promise<CustomConnectorSetupDto>;
  validateConnector(
    request: CustomConnectorValidationRequest
  ): Promise<CustomConnectorValidationDto>;
}
