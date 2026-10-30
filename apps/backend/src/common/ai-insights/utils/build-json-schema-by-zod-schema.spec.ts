import { z } from 'zod';
import { buildJsonSchema } from './build-json-schema-by-zod-schema';

describe('buildJsonSchema', () => {
  it('describes the object the model must send, leaving defaulted fields optional', () => {
    const schema = z.object({
      sql: z.string().describe('The query'),
      required: z.boolean().default(true),
    });

    expect(buildJsonSchema(schema)).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The query' },
        required: { type: 'boolean', default: true },
      },
      required: ['sql'],
    });
  });
});
