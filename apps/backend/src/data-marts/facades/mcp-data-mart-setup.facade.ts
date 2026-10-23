import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import type { DataMartDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition';
import type { BlendedFieldsConfig } from '../dto/schemas/blended-fields-config.schema';
import type { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';
import type { DraftCalculatedField } from '../dto/domain/validate-formula.command';

export { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
export { DataMartStatus } from '../enums/data-mart-status.enum';
export { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
export { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
export { BigQueryFieldMode } from '../data-storage-types/bigquery/enums/bigquery-field-mode.enum';
export { SnowflakeFieldType } from '../data-storage-types/snowflake/enums/snowflake-field-type.enum';
export { AthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
export { RedshiftFieldType } from '../data-storage-types/redshift/enums/redshift-field-type.enum';
export { DatabricksFieldType } from '../data-storage-types/databricks/enums/databricks-field-type.enum';
export { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
export { CALCULATED_FIELD_LEVELS } from '../calculated-fields/formula-level';
export {
  DataMartIcon,
  DATA_MART_ICON_MAX_LENGTH,
  DATA_MART_ICON_PATTERN,
} from '../enums/data-mart-icon.enum';
export {
  AGGREGATE_FUNCTIONS,
  REPORT_AGGREGATE_FUNCTIONS,
} from '../dto/schemas/aggregate-function.schema';
export { StorageResourceLevel } from '../dto/domain/list-storage-resources.command';
export type { DataMartIconValue, BlendedFieldsConfig };

export const MCP_DATA_MART_SETUP_FACADE = Symbol('MCP_DATA_MART_SETUP_FACADE');

export interface McpDataMartSetupContext {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpDataMartConfiguration {
  id: string;
  title: string;
  status: string;
  storage: { id: string; title: string; type: string };
  definitionType: DataMartDefinitionType | null;
  definition: DataMartDefinition | null;
  description: string | null;
  icon: DataMartIconValue | null;
  schema: DataMartSchema | null;
  businessOwnerIds: string[];
  technicalOwnerIds: string[];
  availableForReporting: boolean;
  availableForMaintenance: boolean;
  contexts: Array<{ id: string; name: string }>;
  blendedFieldsConfig: BlendedFieldsConfig | null;
  createdAt: string;
  modifiedAt: string;
}

export interface McpDataMartTarget {
  dataMartId: string;
}

export interface McpDataMartDefinitionInput extends McpDataMartTarget {
  definitionType: DataMartDefinitionType;
  definition: DataMartDefinition;
  sourceDataMartId?: string;
  sourceConfigurationId?: string;
}

export interface McpFormulaViolation {
  code: string;
  message: string;
  field: string;
  subject?: string;
}

export interface McpFormulaValidationResult {
  errors: McpFormulaViolation[];
  warnings: McpFormulaViolation[];
  otherFieldErrors: McpFormulaViolation[];
}

export interface McpStorageResourceList {
  namespaces?: Array<{ id: string; label?: string }>;
  resources?: Array<{
    id: string;
    groupId: string;
    type: 'TABLE' | 'VIEW';
    fullyQualifiedName: string;
    location?: string;
    locationMismatch?: boolean;
  }>;
}

export interface McpDataMartSetupFacade {
  getDataMart(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration>;
  createDataMart(
    ctx: McpDataMartSetupContext,
    input: { title: string; storageId: string; icon?: DataMartIconValue | null }
  ): Promise<{ id: string; title: string }>;
  updateDataMartMetadata(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & {
      title?: string;
      description?: string | null;
      icon?: DataMartIconValue | null;
    }
  ): Promise<McpDataMartConfiguration>;
  updateDataMartDefinition(
    ctx: McpDataMartSetupContext,
    input: McpDataMartDefinitionInput
  ): Promise<McpDataMartConfiguration>;
  updateDataMartSchema(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { schema: unknown }
  ): Promise<McpDataMartConfiguration & { warnings: McpFormulaViolation[] }>;
  updateDataMartOwners(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { businessOwnerIds: string[]; technicalOwnerIds: string[] }
  ): Promise<McpDataMartConfiguration>;
  updateDataMartAvailability(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { availableForReporting: boolean; availableForMaintenance: boolean }
  ): Promise<void>;
  updateDataMartContexts(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { contextIds: string[] }
  ): Promise<void>;
  updateDataMartBlendedFieldsConfig(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & { blendedFieldsConfig: BlendedFieldsConfig | null }
  ): Promise<McpDataMartConfiguration>;
  publishDataMart(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration>;
  deleteDataMart(ctx: McpDataMartSetupContext, input: McpDataMartTarget): Promise<void>;
  validateDataMartDefinition(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<{
    valid: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
    reason?: Record<string, unknown>;
  }>;
  validateDataMartFormula(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget & {
      name: string;
      type: string;
      formula: string;
      calculatedFields?: DraftCalculatedField[];
    }
  ): Promise<McpFormulaValidationResult>;
  actualizeDataMartSchema(
    ctx: McpDataMartSetupContext,
    input: McpDataMartTarget
  ): Promise<McpDataMartConfiguration>;
  listDataStorages(
    ctx: McpDataMartSetupContext
  ): Promise<Array<{ id: string; title: string; type: string }>>;
  listStorageResources(
    ctx: McpDataMartSetupContext,
    input: {
      storageId: string;
      level: 'namespaces' | 'resources';
      namespaceId?: string;
      resourceType?: 'TABLE' | 'VIEW' | 'TABLE_PATTERN';
    }
  ): Promise<McpStorageResourceList>;
}
