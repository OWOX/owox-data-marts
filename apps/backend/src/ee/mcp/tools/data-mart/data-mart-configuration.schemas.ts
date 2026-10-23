import { z } from 'zod-v4';
import {
  DATA_MART_ICON_MAX_LENGTH,
  DataMartIcon,
  AGGREGATE_FUNCTIONS,
  REPORT_AGGREGATE_FUNCTIONS,
  DataMartDefinitionType,
  DataMartStatus,
  DataStorageType,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { dataMartSchemaOutput } from './data-mart-schema.schemas';
export { dataMartSchemaInput } from './data-mart-schema.schemas';

export const dataMartTargetShape = {
  data_mart_id: z
    .string()
    .min(1)
    .describe('ID of the draft or published Data Mart in the connected project.'),
};
export const dataMartIconSchema = z
  .union([
    z.enum(DataMartIcon),
    z.templateLiteral(['lucide:', z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]),
  ])
  .refine(value => value.length <= DATA_MART_ICON_MAX_LENGTH, 'Icon is too long')
  .meta({ maxLength: DATA_MART_ICON_MAX_LENGTH })
  .describe(
    'Built-in Data Mart icon or a Lucide identifier such as lucide:chart-bar. Use null on the enclosing property to restore the default icon.'
  );

export const formulaViolationSchema = z.object({
  code: z.string().describe('Machine-readable formula violation code.'),
  message: z.string().describe('Explanation of the problem or warning.'),
  field: z.string().describe('Calculated field to which this violation belongs.'),
  subject: z
    .string()
    .optional()
    .describe('Reference label or function name inside the formula, when available.'),
});

export const definitionSchemas = {
  SQL: z.object({
    sqlQuery: z
      .string()
      .min(1)
      .describe(
        'SQL source query in the storage dialect. Example: SELECT * FROM `project.dataset.orders`. Validate the saved definition before publishing.'
      ),
  }),
  TABLE: z.object({
    fullyQualifiedName: z
      .string()
      .min(1)
      .describe(
        'Fully qualified table name from list_storage_resources, such as project.dataset.orders.'
      ),
  }),
  TABLE_PATTERN: z.object({
    pattern: z
      .string()
      .min(2)
      .describe(
        'Warehouse table wildcard pattern, such as project.dataset.orders_*. At least two characters.'
      ),
  }),
  VIEW: z.object({
    fullyQualifiedName: z
      .string()
      .min(1)
      .describe('Fully qualified warehouse view name from list_storage_resources.'),
  }),
  CONNECTOR: z.object({
    connector: z.object({
      source: z.object({
        name: z
          .string()
          .min(1)
          .describe(
            'Registered connector source name from list_connectors or the existing definition.'
          ),
        configuration: z
          .array(
            z
              .record(z.string(), z.unknown())
              .describe(
                'Connector-specific keys from get_connector_specification. Keep masked secret values from the saved definition. With both public source IDs, supply one entry of overrides, or {} to copy unchanged; credentials are resolved on the server.'
              )
          )
          .min(1)
          .describe(
            'At least one connector configuration. Key names depend on the registered connector.'
          ),
        node: z
          .string()
          .min(1)
          .describe(
            'Connector entity/node to import from get_connector_fields or preview_connector_fields.'
          ),
        fields: z
          .array(z.string())
          .min(1)
          .describe(
            'Source fields from get_connector_fields or preview_connector_fields; at least one is required.'
          ),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional positive connector source version.'),
      }),
      storage: z.object({
        fullyQualifiedName: z
          .string()
          .min(1)
          .describe('Fully qualified destination table for imported connector data.'),
      }),
    }),
  }),
};

export const dataMartDefinitionInput = z
  .discriminatedUnion('type', [
    definitionSchemas.SQL.extend({ type: z.literal(DataMartDefinitionType.SQL) }).strict(),
    definitionSchemas.TABLE.extend({ type: z.literal(DataMartDefinitionType.TABLE) }).strict(),
    definitionSchemas.TABLE_PATTERN.extend({
      type: z.literal(DataMartDefinitionType.TABLE_PATTERN),
    }).strict(),
    definitionSchemas.VIEW.extend({ type: z.literal(DataMartDefinitionType.VIEW) }).strict(),
    definitionSchemas.CONNECTOR.extend({
      type: z.literal(DataMartDefinitionType.CONNECTOR),
    }).strict(),
  ])
  .describe(
    'Source type and matching body in one object. SQL: {type:"SQL",sqlQuery:"SELECT 1"}; TABLE/VIEW: {type:"TABLE",fullyQualifiedName:"project.dataset.orders"}; TABLE_PATTERN uses pattern; CONNECTOR uses connector.source and connector.storage. Read the saved definition first and preserve masked values.'
  );

const blendedFieldOverrideShape = {
  alias: z.string().min(1).max(255).optional().describe('Display label for this field.'),
  isHidden: z.boolean().optional().describe('Hide the field in the blended result.'),
  aggregateFunction: z
    .enum(AGGREGATE_FUNCTIONS)
    .optional()
    .describe('Aggregation applied to this source field before joining.'),
  postJoinAggregations: z
    .array(z.enum(REPORT_AGGREGATE_FUNCTIONS))
    .optional()
    .describe('Allowed report aggregations after joining; an empty array disables aggregation.'),
};

const blendedSourceShape = {
  path: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/)
    .describe(
      'Dot-separated relationship alias path, such as orders or orders.items. Uses lowercase letters, numbers and underscores; this is an identifier rather than a display label.'
    ),
  alias: z
    .string()
    .min(1)
    .max(255)
    .describe('Display label for this source in report column headers.'),
  isExcluded: z
    .boolean()
    .optional()
    .describe('Exclude this joined source from the blended result.'),
  description: z
    .string()
    .trim()
    .min(1)
    .max(10000)
    .optional()
    .describe(
      'Join description override. Omit to inherit the relationship description; blank text is rejected.'
    ),
};

export const blendedFieldsConfigSchema = z
  .strictObject({
    sources: z
      .array(
        z.strictObject({
          ...blendedSourceShape,
          fields: z
            .record(z.string(), z.strictObject(blendedFieldOverrideShape))
            .optional()
            .describe(
              'Overrides keyed by the original field name. Omitted field overrides are removed when replacing the configuration.'
            ),
        })
      )
      .describe(
        'Complete list of blended source overrides. Omitted sources revert to their default configuration.'
      ),
  })
  .describe(
    'Replacement blended configuration. Source paths identify joins, aliases are display labels, and fields is a dictionary of per-field overrides.'
  );

const blendedFieldsConfigOutputSchema = z.looseObject({
  sources: z
    .array(
      z.looseObject({
        ...blendedSourceShape,
        fields: z
          .record(z.string(), z.looseObject(blendedFieldOverrideShape))
          .optional()
          .describe('Saved per-field overrides keyed by the original field name.'),
      })
    )
    .describe('Saved source overrides with additive metadata preserved.'),
});

export const dataMartConfigurationSchema = z.object({
  id: z.string().describe('Data Mart ID used by configuration tools.'),
  title: z.string().describe('Data Mart display name.'),
  status: z
    .enum(DataMartStatus)
    .describe('DRAFT can be configured; PUBLISHED can also be queried and used in reports.'),
  storage: z
    .object({ id: z.string(), title: z.string(), type: z.enum(DataStorageType) })
    .describe('Storage identity only; credentials are never returned.'),
  definitionType: z
    .enum(DataMartDefinitionType)
    .nullable()
    .describe(
      'Source kind, or null when the draft has no definition. When editing, copy this into definition.type.'
    ),
  definition: z
    .union([
      definitionSchemas.SQL,
      definitionSchemas.TABLE,
      definitionSchemas.TABLE_PATTERN,
      definitionSchemas.CONNECTOR,
    ])
    .nullable()
    .describe(
      'Saved source body matching definitionType; TABLE and VIEW share fullyQualifiedName. Connector secrets are masked. When editing, add type: definitionType to this body.'
    ),
  description: z.string().nullable().describe('Business description; null when absent.'),
  icon: dataMartIconSchema.nullable(),
  schema: dataMartSchemaOutput
    .nullable()
    .describe(
      'Saved warehouse schema, or null before schema actualization. Includes server-owned field status and calculated-field validation metadata.'
    ),
  businessOwnerIds: z
    .array(z.string())
    .describe('Business owner user IDs from list_project_members.'),
  technicalOwnerIds: z
    .array(z.string())
    .describe('Technical owner user IDs from list_project_members.'),
  availableForReporting: z
    .boolean()
    .describe(
      'Whether project sharing allows reporting, subject to Context and resource permissions.'
    ),
  availableForMaintenance: z
    .boolean()
    .describe(
      'Whether project sharing allows maintenance, subject to Context and resource permissions.'
    ),
  contexts: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe('Contexts assigned to the Data Mart.'),
  blendedFieldsConfig: blendedFieldsConfigOutputSchema
    .nullable()
    .describe('Saved source and field overrides, or null when no overrides are configured.'),
  createdAt: z.string().datetime().describe('Creation time in ISO 8601 UTC format.'),
  modifiedAt: z.string().datetime().describe('Last modification time in ISO 8601 UTC format.'),
});
export const dataMartConfigurationOutput = { data_mart: dataMartConfigurationSchema };
