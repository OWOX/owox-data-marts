import type { AuthorizationContext } from '../../idp';
import type { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import type { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type { DataMartStatus } from '../enums/data-mart-status.enum';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';
import type {
  DataMartSchema,
  DataMartSchemaUpdate,
} from '../data-storage-types/data-mart-schema.type';
import type { DataMartInputSourceChangeImpactDto } from '../dto/domain/data-mart-input-source-change-impact.dto';

export interface McpDataMartSummaryDto {
  id: string;
  title: string;
  status: DataMartStatus;
  definitionType: DataMartDefinitionType | null;
  createdAt: string;
  modifiedAt: string;
}
export interface McpDataMartSetupDto extends McpDataMartSummaryDto {
  description: string | null;
  icon: string | null;
  storage: { id: string; title: string; type: string };
  definition: DataMartDefinition | null;
  definitionReadError: string | null;
  schema: DataMartSchema | null;
  businessOwnerIds: string[];
  technicalOwnerIds: string[];
  contexts: { id: string; name: string }[];
  availableForReporting: boolean;
  availableForMaintenance: boolean;
}
export interface McpListSetupDataMartsInput {
  offset?: number;
  status?: DataMartStatus;
  storageId?: string;
  contextIds?: string[];
}
export interface McpCreateDataMartInput {
  title: string;
  storageId: string;
  icon?: DataMartIconValue | null;
}
export interface McpUpdateDataMartDefinitionInput {
  definitionType: DataMartDefinitionType;
  definition: DataMartDefinition;
}
export interface McpDataMartValidationDto {
  valid: boolean;
  message: string;
}
export interface McpDataMartSchemaResultDto {
  dataMart: McpDataMartSummaryDto;
  schema: DataMartSchema | null;
  warningCount: number;
  warnings: { code: string; message: string }[];
}

export const MCP_DATA_MART_MANAGEMENT_FACADE = Symbol('MCP_DATA_MART_MANAGEMENT_FACADE');
export interface McpDataMartManagementFacade {
  list(
    actor: AuthorizationContext,
    input: McpListSetupDataMartsInput
  ): Promise<{ items: McpDataMartSummaryDto[]; total: number; offset: number }>;
  get(actor: AuthorizationContext, id: string): Promise<McpDataMartSetupDto>;
  create(
    actor: AuthorizationContext,
    input: McpCreateDataMartInput
  ): Promise<McpDataMartSummaryDto>;
  updateTitle(
    actor: AuthorizationContext,
    id: string,
    title: string
  ): Promise<McpDataMartSummaryDto>;
  updateDescription(
    actor: AuthorizationContext,
    id: string,
    description: string
  ): Promise<McpDataMartSummaryDto>;
  updateIcon(
    actor: AuthorizationContext,
    id: string,
    icon: DataMartIconValue | null
  ): Promise<McpDataMartSummaryDto>;
  updateDefinition(
    actor: AuthorizationContext,
    id: string,
    input: McpUpdateDataMartDefinitionInput
  ): Promise<McpDataMartSummaryDto>;
  validate(actor: AuthorizationContext, id: string): Promise<McpDataMartValidationDto>;
  impact(actor: AuthorizationContext, id: string): Promise<DataMartInputSourceChangeImpactDto>;
  publish(actor: AuthorizationContext, id: string): Promise<McpDataMartSummaryDto>;
  delete(actor: AuthorizationContext, id: string): Promise<void>;
  actualizeSchema(actor: AuthorizationContext, id: string): Promise<McpDataMartSchemaResultDto>;
  updateSchema(
    actor: AuthorizationContext,
    id: string,
    schema: DataMartSchemaUpdate
  ): Promise<McpDataMartSchemaResultDto>;
  setOwners(
    actor: AuthorizationContext,
    id: string,
    businessOwnerIds: string[],
    technicalOwnerIds: string[]
  ): Promise<void>;
  setContexts(actor: AuthorizationContext, id: string, contextIds: string[]): Promise<void>;
  setSharing(
    actor: AuthorizationContext,
    id: string,
    availableForReporting: boolean,
    availableForMaintenance: boolean
  ): Promise<void>;
}
