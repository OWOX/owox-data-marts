import { z } from 'zod';
import {
  BlendedFieldOverrideSchema,
  BlendedSourceSchema,
} from '../../../../data-marts/dto/schemas/blended-fields-config.schema';
import { dataMartTargetSchema } from './data-mart-model.schemas';

const field = BlendedFieldOverrideSchema.shape;
const fieldSettings = z.strictObject({
  alias: field.alias.describe(
    'Optional field label for this join path. Omit it to use the native field alias. If the field has no native alias, reports use its name.'
  ),
  isHidden: field.isHidden.describe('Set to true to hide this field in the report column picker.'),
  aggregateFunction: field.aggregateFunction.describe(
    'Dedup function that combines values for each join key before the join.'
  ),
  postJoinAggregations: field.postJoinAggregations.describe(
    'Functions that reports can use after the join. An empty list disables all of them. Omit to use the type defaults.'
  ),
});

const source = BlendedSourceSchema.shape;
const sourceSettings = z.strictObject({
  path: source.path.describe(
    'Full path of relationship SQL Aliases (targetAlias) from the root Data Mart. For a listed field, copy joined_fields[].aliasPath from get_data_mart_details_by_id with detail_level=with_joined_fields. For other joins, use nodes[].aliasPath from list_data_mart_relationships.'
  ),
  alias: source.alias.meta({
    title: 'Output Alias',
    description:
      'Optional Output Alias for this join. Omit it to use the joined Data Mart title in report column labels.',
  }),
  isExcluded: source.isExcluded.describe(
    'Set to true to turn off "Allow for reporting" for this join.'
  ),
  description: z
    .string()
    .trim()
    .min(1)
    .max(10000)
    .optional()
    .describe(
      'Business meaning of the join on this path. Omit to use the relationship description.'
    ),
  fields: z
    .record(z.string(), fieldSettings)
    .optional()
    .describe(
      'Use original field names from the joined Data Mart as keys. To check a name, read its native schema with get_data_mart_setup.'
    ),
});

export const blendedFieldsConfigSchema = z
  .strictObject({
    sources: z
      .array(sourceSettings)
      .describe('Saved settings by join path. Paths without an entry use their defaults.'),
  })
  .nullable()
  .describe(
    'Complete settings saved on the root Data Mart, including settings for unavailable paths. Null means there are no saved settings.'
  );

export const updateBlendedConfigSchema = dataMartTargetSchema.extend({
  data_mart_id: dataMartTargetSchema.shape.data_mart_id.describe(
    'ID of the root Data Mart that owns the settings for these joined fields.'
  ),
  blended_fields_config: blendedFieldsConfigSchema
    .refine(
      config =>
        config === null ||
        new Set(config.sources.map(source => source.path)).size === config.sources.length,
      { path: ['sources'], message: 'Use each join path only once.' }
    )
    .describe(
      'Complete replacement for the saved settings. Use one entry per join path. Include each override you want to keep. Send null to clear all overrides.'
    ),
});

export const savedBlendedConfigOutputSchema = {
  data_mart_id: updateBlendedConfigSchema.shape.data_mart_id,
  blended_fields_config: blendedFieldsConfigSchema,
};
