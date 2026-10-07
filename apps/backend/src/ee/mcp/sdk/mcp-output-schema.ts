import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z, type ZodRawShape } from 'zod-v4';

const schemaMaps = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const schemaArrays = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const childSchemas = [
  'items',
  'additionalItems',
  'contains',
  'propertyNames',
  'additionalProperties',
  'unevaluatedProperties',
  'not',
  'if',
  'then',
  'else',
];

/** Open output objects for additive changes without changing constraints on known fields. */
function allowAdditionalProperties(schema: unknown): unknown {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
  const result = { ...(schema as Record<string, unknown>) };
  if (result.additionalProperties === false) delete result.additionalProperties;
  for (const key of schemaMaps) {
    const children = result[key];
    if (typeof children === 'object' && children !== null && !Array.isArray(children)) {
      result[key] = Object.fromEntries(
        Object.entries(children).map(([name, child]) => [name, allowAdditionalProperties(child)])
      );
    }
  }
  for (const key of schemaArrays) {
    if (Array.isArray(result[key])) result[key] = result[key].map(allowAdditionalProperties);
  }
  for (const key of childSchemas) {
    if (key in result) result[key] = allowAdditionalProperties(result[key]);
  }
  return result;
}

export function makeMcpOutputSchema(shape: ZodRawShape): StandardSchemaWithJSON {
  const standard = z.object(shape)['~standard'];
  return {
    '~standard': {
      ...standard,
      jsonSchema: {
        input: options => standard.jsonSchema.input(options),
        output: options =>
          allowAdditionalProperties(standard.jsonSchema.output(options)) as Record<string, unknown>,
      },
    },
  };
}
