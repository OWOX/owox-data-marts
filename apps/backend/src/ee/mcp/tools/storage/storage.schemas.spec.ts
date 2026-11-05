import { z } from 'zod';
import { storageConfigurationSchema } from './storage.schemas';

describe('storageConfigurationSchema', () => {
  it.each([undefined, null])('defaults BigQuery location %s to automatic detection', location => {
    expect(storageConfigurationSchema.parse({ projectId: 'my-project', location })).toEqual({
      projectId: 'my-project',
      location: 'AUTODETECT',
    });
  });

  it('preserves an explicit BigQuery location', () => {
    expect(storageConfigurationSchema.parse({ projectId: 'my-project', location: 'EU' })).toEqual({
      projectId: 'my-project',
      location: 'EU',
    });
  });

  it('rejects secret fields when the BigQuery location is null', () => {
    expect(
      storageConfigurationSchema.safeParse({
        projectId: 'my-project',
        location: null,
        password: 'secret',
      }).success
    ).toBe(false);
  });

  it('publishes input and normalized output JSON schemas', () => {
    const input = z.toJSONSchema(storageConfigurationSchema, { io: 'input' });
    const output = z.toJSONSchema(storageConfigurationSchema, { io: 'output' });
    expect(input.anyOf?.[0]).toMatchObject({
      properties: {
        location: { type: ['string', 'null'] },
      },
      additionalProperties: false,
    });
    expect(output.anyOf?.[0]).toMatchObject({
      properties: { location: { type: 'string' } },
      additionalProperties: false,
    });
  });
});
