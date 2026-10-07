import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { z } from 'zod-v4';
import { makeMcpOutputSchema } from './mcp-output-schema';

const validator = new AjvJsonSchemaValidator();
const jsonSchema = (shape: z.ZodRawShape) =>
  makeMcpOutputSchema(shape)['~standard'].jsonSchema.output({ target: 'draft-2020-12' });

describe('MCP output schema compatibility', () => {
  it('accepts additive fields at the root and in array items while preserving known constraints', () => {
    const shape = {
      data_marts: z.array(z.object({ id: z.string(), status: z.enum(['published', 'draft']) })),
    };
    const check = validator.getValidator(jsonSchema(shape));
    expect(
      check({ data_marts: [{ id: 'dm-1', status: 'published', contexts: [] }], future: true }).valid
    ).toBe(true);
    expect(check({ data_marts: [{ id: 123, status: 'published' }] }).valid).toBe(false);
    expect(check({ data_marts: [{ id: 'dm-1', status: 'unknown' }] }).valid).toBe(false);
    expect(check({ data_marts: [{ status: 'published' }] }).valid).toBe(false);
    expect(check({}).valid).toBe(false);
  });

  it('opens optional nested objects and union branches without mutating the original Zod schemas', () => {
    const nested = z.object({ name: z.string() });
    const shape = {
      optional: nested.optional(),
      choice: z.union([z.object({ kind: z.literal('a') }), z.object({ kind: z.literal('b') })]),
    };
    const check = validator.getValidator(jsonSchema(shape));
    expect(
      check({ optional: { name: 'context', future: true }, choice: { kind: 'a', x: 1 } }).valid
    ).toBe(true);
    expect(check({ choice: { kind: 'c', x: 1 } }).valid).toBe(false);
    expect(z.toJSONSchema(nested).additionalProperties).toBe(false);
  });

  it('preserves dictionary value constraints and schema-looking example data', () => {
    const shape = {
      counts: z.record(z.string(), z.number()),
      example: z.string().meta({ examples: [{ additionalProperties: false }] }),
    };
    const json = jsonSchema(shape) as { properties: Record<string, Record<string, unknown>> };
    expect(json.properties.example.examples).toEqual([{ additionalProperties: false }]);
    const check = validator.getValidator(json);
    expect(check({ counts: { orders: 12 }, example: 'x' }).valid).toBe(true);
    expect(check({ counts: { orders: '12' }, example: 'x' }).valid).toBe(false);
  });

  it('retains runtime Zod validation and does not relax input-schema conversion', async () => {
    const schema = makeMcpOutputSchema({ id: z.string(), child: z.object({ name: z.string() }) });
    expect(await schema['~standard'].validate({ id: 123, child: { name: 'x' } })).toHaveProperty(
      'issues'
    );
    const input = schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' });
    expect(input).toEqual(
      z.toJSONSchema(z.object({ id: z.string(), child: z.object({ name: z.string() }) }), {
        target: 'draft-2020-12',
        io: 'input',
      })
    );
  });
});
