import { z } from 'zod';
import { DataMartDefinitionType } from '../../../../data-marts/enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../../../data-marts/enums/data-mart-status.enum';
import {
  DATA_MART_ICON_MAX_LENGTH,
  DATA_MART_ICON_PATTERN,
} from '../../../../data-marts/enums/data-mart-icon.enum';
import { SqlDefinitionSchema } from '../../../../data-marts/dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { TableDefinitionSchema } from '../../../../data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { TablePatternDefinitionSchema } from '../../../../data-marts/dto/schemas/data-mart-table-definitions/table-pattern-definition.schema';
import {
  ConnectorSourceSchema,
  ConnectorStorageSchema,
} from '../../../../data-marts/dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartSchemaSchema } from '../../../../data-marts/data-storage-types/data-mart-schema.type';

const id = z.string().trim().min(1);
const title = z.string().trim().min(1).max(255);
const icon = z.string().max(DATA_MART_ICON_MAX_LENGTH).regex(DATA_MART_ICON_PATTERN).nullable();
export const dataMartIdSchema = z.object({ data_mart_id: id }).strict();
export const listSetupDataMartsSchema = z
  .object({
    status: z.enum(DataMartStatus).optional(),
    storage_id: id.optional(),
    context_ids: z.array(id).max(100).optional(),
    offset: z.number().int().min(0).default(0),
  })
  .strict();
export const createDataMartSchema = z
  .object({ title, storage_id: id, icon: icon.optional() })
  .strict();
export const updateDataMartTitleSchema = dataMartIdSchema.extend({ title });
export const updateDataMartDescriptionSchema = dataMartIdSchema.extend({
  description: z
    .string()
    .refine(
      value => Buffer.byteLength(value, 'utf8') <= 65_535,
      'Must not exceed 65535 UTF-8 bytes'
    )
    .describe(
      'Use Markdown, up to 65535 UTF-8 bytes. Pass an empty string to clear the description.'
    ),
});
export const updateDataMartIconSchema = dataMartIdSchema.extend({ icon });

const sql = SqlDefinitionSchema.strict();
const table = TableDefinitionSchema.strict();
const pattern = TablePatternDefinitionSchema.strict();
const connector = z
  .object({
    connector: z
      .object({
        source: ConnectorSourceSchema.extend({
          configuration: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
        }).strict(),
        storage: ConnectorStorageSchema.strict(),
      })
      .strict(),
  })
  .strict();
const definitionSchemas = {
  [DataMartDefinitionType.SQL]: sql,
  [DataMartDefinitionType.TABLE]: table,
  [DataMartDefinitionType.TABLE_PATTERN]: pattern,
  [DataMartDefinitionType.VIEW]: table,
  [DataMartDefinitionType.CONNECTOR]: connector,
};
export const updateDataMartDefinitionSchema = dataMartIdSchema
  .extend({
    definition_type: z.enum(DataMartDefinitionType),
    definition: z
      .union([sql, table, pattern, connector])
      .describe(
        'Supply the complete replacement definition. Connector configurations accept only non-secret settings and _credential_id. Preserve each existing configuration _id. Use list_credential_definitions and Credential setup for authorization. For a connector, set connector.storage.fullyQualifiedName to dataset.table on Google BigQuery and to database.table on AWS Athena. Do not include the project or the catalog, even when list_storage_resources returns them.'
      ),
  })
  .refine(input => definitionSchemas[input.definition_type].safeParse(input.definition).success, {
    message: 'The definition must match definition_type.',
    path: ['definition'],
  });
export const updateDataMartSchemaSchema = dataMartIdSchema.extend({
  schema: DataMartSchemaSchema.describe(
    'Supply the complete schema. In calculated.formula, reference fields with {{ref field="field_name"}}. Example: SUM({{ref field="amount"}}). Omit calculated.level and calculated.warehouseValidation. OWOX derives them during validation.'
  ),
});
export const setDataMartOwnersSchema = dataMartIdSchema.extend({
  business_owner_ids: z.array(id).max(100),
  technical_owner_ids: z.array(id).max(100),
});
export const setDataMartContextsSchema = dataMartIdSchema.extend({
  context_ids: z.array(id).max(100),
});
export const setDataMartSharingSchema = dataMartIdSchema.extend({
  available_for_reporting: z.boolean(),
  available_for_maintenance: z.boolean(),
});

export const dataMartSummaryOutputSchema = z.object({
  data_mart_id: z.string(),
  url: z.string(),
  title: z.string(),
  status: z.string(),
  definition_type: z.string().nullable(),
  created_at: z.string(),
  modified_at: z.string(),
});
export const dataMartSetupOutputSchema = dataMartSummaryOutputSchema.extend({
  description: z.string().nullable(),
  icon: z.string().nullable(),
  storage: z.object({ storage_id: z.string(), title: z.string(), type: z.string() }),
  definition: z.record(z.string(), z.unknown()).nullable(),
  definition_read_error: z.string().nullable(),
  schema: z.record(z.string(), z.unknown()).nullable(),
  business_owner_ids: z.array(z.string()),
  technical_owner_ids: z.array(z.string()),
  contexts: z.array(z.object({ context_id: z.string(), name: z.string() })),
  available_for_reporting: z.boolean(),
  available_for_maintenance: z.boolean(),
});
