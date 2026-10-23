import { z } from 'zod-v4';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  SnowflakeFieldType,
  AthenaFieldType,
  RedshiftFieldType,
  DatabricksFieldType,
  DataMartSchemaFieldStatus,
  CALCULATED_FIELD_LEVELS,
  REPORT_AGGREGATE_FUNCTIONS,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';

const fieldShape = (type: z.ZodType<string>) => ({
  name: z
    .string()
    .min(1)
    .describe('Case-sensitive warehouse column name, or the name of a top-level calculated field.'),
  type,
  alias: z
    .string()
    .optional()
    .describe('Business label used in output; name remains the column identifier.'),
  description: z.string().optional().describe('Business meaning of this field.'),
  isPrimaryKey: z
    .boolean()
    .optional()
    .describe(
      'Part of the Data Mart output primary key. Calculated fields cannot be primary keys. Defaults to false.'
    ),
  isHiddenForReporting: z
    .boolean()
    .optional()
    .describe('Hide the field from reporting and blending. Defaults to false.'),
  aggregationRole: z
    .enum(['dimension', 'metric'])
    .optional()
    .describe(
      'Grouping dimension or aggregatable metric. Omit to derive the default from the field type.'
    ),
  allowedAggregations: z
    .array(z.enum(REPORT_AGGREGATE_FUNCTIONS))
    .optional()
    .describe(
      'Report aggregation functions allowed for this field. Omit for type-derived defaults; an empty array disables aggregation. Functions must also be compatible with the warehouse type.'
    ),
  calculated: z
    .object({
      formula: z
        .string()
        .min(1)
        .max(10000)
        .describe(
          'Warehouse-dialect SQL with {{ref field="amount"}} references. Calculated fields must be top-level and have unique names; formulas are validated by the domain service before saving.'
        ),
      level: z
        .enum(CALCULATED_FIELD_LEVELS)
        .optional()
        .describe(
          'Server-derived formula level: metric aggregates, column is row-level. Omit on edits; accepted for round trips and recalculated from the formula.'
        ),
      warehouseValidation: z
        .enum(['passed', 'skipped'])
        .optional()
        .describe(
          'Server-owned warehouse validation result. Omit on edits; skipped means the warehouse check was unavailable.'
        ),
    })
    .optional()
    .describe('Present only for calculated fields; remove this property to use a native column.'),
  status: z
    .enum(DataMartSchemaFieldStatus)
    .optional()
    .describe(
      'Server-owned connection status. Omit on edits; submitted values never override the status derived from schema actualization.'
    ),
});

export interface SchemaField {
  name: string;
  type: string;
  fields?: SchemaField[];
  [key: string]: unknown;
}

const bigQueryFieldSchema: z.ZodType<SchemaField> = z.looseObject({
  ...fieldShape(
    z
      .enum(BigQueryFieldType)
      .describe(
        'Canonical BigQuery field type. Use INTEGER rather than INT64, FLOAT rather than FLOAT64.'
      )
  ),
  mode: z
    .enum(BigQueryFieldMode)
    .describe(
      'Required for every BigQuery field, including nested fields. REPEATED represents an array.'
    ),
  get fields(): z.ZodOptional<z.ZodArray<typeof bigQueryFieldSchema>> {
    return z
      .array(bigQueryFieldSchema)
      .optional()
      .describe(
        'Nested field definitions for RECORD/STRUCT columns. Every child also requires name, type, and mode.'
      );
  },
});

const snowflakeFieldSchema: z.ZodType<SchemaField> = z.looseObject({
  ...fieldShape(
    z
      .enum(SnowflakeFieldType)
      .describe(
        'Canonical Snowflake field type from the saved schema, such as STRING, NUMERIC, or VARIANT.'
      )
  ),
  get fields(): z.ZodOptional<z.ZodArray<typeof snowflakeFieldSchema>> {
    return z
      .array(snowflakeFieldSchema)
      .optional()
      .describe(
        'Nested fields for complex Snowflake columns; each child uses the same field shape.'
      );
  },
});

export const dataMartSchemaInput = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('bigquery-data-mart-schema'),
        fields: z
          .array(bigQueryFieldSchema)
          .describe('Complete BigQuery field list; omitted fields are removed.'),
      })
      .strict(),
    z
      .object({
        type: z.literal('snowflake-data-mart-schema'),
        fields: z
          .array(snowflakeFieldSchema)
          .describe('Complete Snowflake field list; omitted fields are removed.'),
      })
      .strict(),
    z
      .object({
        type: z.literal('athena-data-mart-schema'),
        fields: z
          .array(
            z.looseObject(
              fieldShape(
                z
                  .enum(AthenaFieldType)
                  .describe('Canonical Athena field type from the saved schema.')
              )
            )
          )
          .describe('Complete Athena field list; omitted fields are removed.'),
      })
      .strict(),
    z
      .object({
        type: z.literal('redshift-data-mart-schema'),
        fields: z
          .array(
            z.looseObject(
              fieldShape(
                z
                  .enum(RedshiftFieldType)
                  .describe('Canonical Redshift field type from the saved schema.')
              )
            )
          )
          .describe('Complete Redshift field list; omitted fields are removed.'),
      })
      .strict(),
    z
      .object({
        type: z.literal('databricks-data-mart-schema'),
        table: z
          .string()
          .describe(
            'Required Databricks table identifier from the saved schema; preserve it when editing fields.'
          ),
        fields: z
          .array(
            z.looseObject(
              fieldShape(
                z
                  .enum(DatabricksFieldType)
                  .describe('Canonical Databricks field type, such as INT, STRING, or DECIMAL.')
              )
            )
          )
          .describe('Complete Databricks field list; omitted fields are removed.'),
      })
      .strict(),
  ])
  .describe(
    'Complete replacement schema matching the connected storage. Start from get_data_mart_configuration and preserve fields and unknown field metadata that should remain. Field types, modes and aggregations follow the existing API. Formulas, names, and storage access are additionally checked by the domain services.'
  );

export const dataMartSchemaOutput = z.union(
  dataMartSchemaInput.options.map(schema => schema.loose())
);
