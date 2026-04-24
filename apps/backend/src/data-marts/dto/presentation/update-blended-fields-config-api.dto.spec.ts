import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBlendedFieldsConfigApiDto } from './update-blended-fields-config-api.dto';

async function validateDto(payload: unknown) {
  const instance = plainToInstance(UpdateBlendedFieldsConfigApiDto, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdateBlendedFieldsConfigApiDto validation', () => {
  it('accepts a valid config', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders.items',
            alias: 'Order Items',
            isExcluded: false,
            fields: {
              revenue: { aggregateFunction: 'SUM' },
              internal_id: { isHidden: true },
            },
          },
        ],
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts null to clear the config', async () => {
    const errors = await validateDto({ blendedFieldsConfig: null });
    expect(errors).toHaveLength(0);
  });

  it('accepts a missing field', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts empty sources array', async () => {
    const errors = await validateDto({ blendedFieldsConfig: { sources: [] } });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['uppercase segment', 'Orders.items'],
    ['dash in segment', 'orders-items'],
    ['space in segment', 'orders items'],
    ['semicolon', 'orders;DROP'],
    ['trailing dot', 'orders.'],
    ['leading dot', '.orders'],
    ['empty', ''],
  ])('rejects path with %s: %p', async (_label, path) => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [{ path, alias: 'x' }],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects path longer than 255 chars', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [{ path: 'a'.repeat(256), alias: 'x' }],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects empty alias', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [{ path: 'orders', alias: '' }],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects alias longer than 255 chars', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [{ path: 'orders', alias: 'a'.repeat(256) }],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects missing sources when config is present', async () => {
    const errors = await validateDto({ blendedFieldsConfig: {} });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown aggregateFunction in field override', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { aggregateFunction: 'BOGUS' },
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects empty alias in field override', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { alias: '' },
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-string alias in field override', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { alias: 123 },
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-boolean isHidden in field override', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { isHidden: 'yes' },
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-object value inside fields record', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: 'not-an-object',
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-plain object (Map) inside fields record', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: new Map([['aggregateFunction', 'SUM']]),
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown properties inside a field override (whitelist enforced)', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { aggregateFunction: 'SUM', foo: 'bar' },
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects array as a fields-record value', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: ['SUM'],
            },
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a field override alias with spaces and mixed case (display label)', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {
              revenue: { alias: 'Total Revenue' },
            },
          },
        ],
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty fields record', async () => {
    const errors = await validateDto({
      blendedFieldsConfig: {
        sources: [
          {
            path: 'orders',
            alias: 'Orders',
            fields: {},
          },
        ],
      },
    });
    expect(errors).toHaveLength(0);
  });
});
