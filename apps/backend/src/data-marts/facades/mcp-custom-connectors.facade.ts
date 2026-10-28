import type { ConnectorFieldsDto } from '../dto/domain/connector-fields.dto';
import type {
  CustomConnectorActor,
  CustomConnectorMetadataInput,
  CreateCustomConnectorInput,
  CustomConnectorCreatedDto,
  CustomConnectorDto,
  CustomConnectorVersionStateDto,
  CustomConnectorDetailDto,
  CustomConnectorVersionDto,
  CustomConnectorPublishedDto,
  CustomConnectorActivatedDto,
  CustomConnectorTestInput,
  CustomConnectorTestResultDto,
} from '../dto/domain/custom-connector.dto';
import type {
  ConnectorSpecificationItemDto,
  ConnectorSpecificationDto,
} from '../dto/domain/connector-specification.dto';

export {
  MAX_MANIFEST_SIZE_BYTES,
  MAX_TEXT_COLUMN_BYTES,
  MAX_VARCHAR_LENGTH,
} from '../connector-types/custom-connector-limits';

export const MCP_CUSTOM_CONNECTORS_FACADE = Symbol('MCP_CUSTOM_CONNECTORS_FACADE');

export type McpCustomConnectorActor = CustomConnectorActor;
export type McpCustomConnectorMetadataInput = CustomConnectorMetadataInput;
export type McpCreateCustomConnectorInput = CreateCustomConnectorInput;
export type McpCustomConnectorCreated = CustomConnectorCreatedDto;
export type McpCustomConnector = CustomConnectorDto;
export type McpCustomConnectorVersionState = CustomConnectorVersionStateDto;
export type McpCustomConnectorDetail = CustomConnectorDetailDto;
export type McpCustomConnectorVersion = CustomConnectorVersionDto;
export type McpCustomConnectorPublished = CustomConnectorPublishedDto;
export type McpCustomConnectorActivated = CustomConnectorActivatedDto;
export type McpCustomConnectorTestInput = CustomConnectorTestInput;
export type McpCustomConnectorTestResult = CustomConnectorTestResultDto;
export type McpCustomConnectorSpecificationItem = ConnectorSpecificationItemDto;
export type McpCustomConnectorSpecification = ConnectorSpecificationDto;

export interface McpCustomConnectorsFacade {
  list(projectId: string): Promise<McpCustomConnector[]>;
  get(projectId: string, id: string): Promise<McpCustomConnectorDetail>;
  create(
    actor: McpCustomConnectorActor,
    input: McpCreateCustomConnectorInput
  ): Promise<McpCustomConnectorCreated>;
  updateMetadata(
    projectId: string,
    id: string,
    input: McpCustomConnectorMetadataInput
  ): Promise<McpCustomConnectorDetail>;
  getVersion(projectId: string, id: string, version: number): Promise<McpCustomConnectorVersion>;
  saveDraft(
    projectId: string,
    id: string,
    manifest: Record<string, unknown>
  ): Promise<McpCustomConnectorVersionState>;
  publish(actor: McpCustomConnectorActor, id: string): Promise<McpCustomConnectorPublished>;
  activate(
    actor: McpCustomConnectorActor,
    id: string,
    version: number
  ): Promise<McpCustomConnectorActivated>;
  delete(projectId: string, id: string): Promise<void>;
  getSpecification(
    projectId: string,
    id: string,
    version?: number
  ): Promise<McpCustomConnectorSpecification[]>;
  getFields(projectId: string, id: string, version?: number): Promise<ConnectorFieldsDto[]>;
  test(
    projectId: string,
    input: McpCustomConnectorTestInput
  ): Promise<McpCustomConnectorTestResult>;
}
