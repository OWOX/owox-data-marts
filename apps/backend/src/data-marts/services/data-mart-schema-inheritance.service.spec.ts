import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartSchemaInheritanceService } from './data-mart-schema-inheritance.service';

const ids = {
  b: 'bbbbbbbb-0000-4000-8000-000000000001',
  orders: 'aaaaaaaa-0000-4000-8000-000000000002',
  costs: 'cccccccc-0000-4000-8000-000000000003',
};
const storage = {
  id: 'storage-1',
  type: DataStorageType.GOOGLE_BIGQUERY,
  projectId: 'project-1',
};
const ref = (title: string, id: string) => `[${title}](dm:${id})`;

type Field = Record<string, unknown> & { name: string };

const schemaOf = (fields: Field[]) =>
  ({ type: 'bigquery-data-mart-schema', fields }) as unknown as DataMartSchema;

const field = (name: string, extra: Partial<Field> = {}): Field => ({
  name,
  type: 'STRING',
  mode: 'NULLABLE',
  isPrimaryKey: false,
  isHiddenForReporting: false,
  status: DataMartSchemaFieldStatus.CONNECTED,
  ...extra,
});

function dataMart(id: string, title: string, sql: string | null, fields: Field[] = []): DataMart {
  return Object.assign(new DataMart(), {
    id,
    title,
    projectId: 'project-1',
    storage,
    definition: sql === null ? { fullyQualifiedName: 'p.d.t' } : { sqlQuery: sql },
    schema: schemaOf(fields),
  });
}

function createService(store: DataMart[], referencing: Record<string, DataMart[]> = {}) {
  const resolver = {
    findReferencedDataMarts: jest.fn(async (wanted: readonly string[]) =>
      store.filter(dm => wanted.includes(dm.id))
    ),
    findReferencingDataMarts: jest.fn(async (source: { id: string }) =>
      // The real lookup does not load the storage relation.
      (referencing[source.id] ?? []).map(dm => ({ ...dm, storage: undefined }) as never)
    ),
  };
  // The rows as saved: each Data Mart that references another, before propagation updates it.
  const saved = new Map(
    Object.values(referencing)
      .flat()
      .map(dm => [dm.id, dm])
  );
  const repository = {
    update: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => saved.get(where.id) ?? null),
  };
  const service = new DataMartSchemaInheritanceService(resolver as never, repository as never);
  return { service, resolver, repository };
}

const orders = dataMart(ids.orders, 'Orders', null, [
  field('order_id', { alias: 'Order ID', description: 'Unique order', isPrimaryKey: true }),
  field('channel', { alias: 'Sales channel' }),
  field('margin', { calculated: { formula: 'SUM(x)' } }),
  field('legacy', { alias: 'Gone', status: DataMartSchemaFieldStatus.DISCONNECTED }),
]);

describe('DataMartSchemaInheritanceService.applyInheritance', () => {
  it('gives a pass-through field the alias and description of the referenced field', async () => {
    const { service } = createService([orders]);
    const b = dataMart(ids.b, 'Retail orders', `SELECT * FROM ${ref('Orders', ids.orders)} o`);

    const { schema, changed } = await service.applyInheritance(
      b,
      schemaOf([
        field('order_id', { alias: 'My own', description: 'Edited' }),
        field('channel', { description: 'Will go' }),
        field('retail_only'),
      ])
    );

    expect(changed).toBe(true);
    const [orderId, channel, own] = schema!.fields as unknown as Field[];
    expect(orderId).toMatchObject({
      alias: 'Order ID',
      description: 'Unique order',
      isPrimaryKey: false,
      inheritedFrom: { dataMartId: ids.orders, dataMartTitle: 'Orders' },
    });
    expect(channel).toMatchObject({ alias: 'Sales channel', inheritedFrom: expect.anything() });
    expect(channel).not.toHaveProperty('description');
    expect(own).not.toHaveProperty('inheritedFrom');
  });

  it('does not inherit from calculated or disconnected fields', async () => {
    const { service } = createService([orders]);
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`);

    const { schema } = await service.applyInheritance(
      b,
      schemaOf([field('margin', { alias: 'Own' }), field('legacy', { alias: 'Own too' })])
    );

    for (const own of schema!.fields as unknown as Field[]) {
      expect(own).not.toHaveProperty('inheritedFrom');
    }
  });

  it('inherits nothing when several referenced Data Marts have the field', async () => {
    const costs = dataMart(ids.costs, 'Costs', null, [field('channel', { alias: 'Ad channel' })]);
    const { service } = createService([orders, costs]);
    const b = dataMart(
      ids.b,
      'B',
      `SELECT * FROM ${ref('Orders', ids.orders)} o JOIN ${ref('Costs', ids.costs)} c USING (channel)`
    );

    const { schema } = await service.applyInheritance(
      b,
      schemaOf([field('channel', { alias: 'Mine' }), field('order_id')])
    );

    const [channel, orderId] = schema!.fields as unknown as Field[];
    expect(channel).toEqual(field('channel', { alias: 'Mine' }));
    expect(orderId).toMatchObject({ alias: 'Order ID', inheritedFrom: expect.anything() });
  });

  it('makes a field its own again, keeping its values, once the reference is gone', async () => {
    const { service } = createService([orders]);
    const b = dataMart(ids.b, 'B', 'SELECT 1 AS order_id');
    const inherited = field('order_id', {
      alias: 'Order ID',
      inheritedFrom: { dataMartId: ids.orders, dataMartTitle: 'Orders' },
    });

    const { schema, changed } = await service.applyInheritance(b, schemaOf([inherited]));

    expect(changed).toBe(true);
    expect((schema!.fields as unknown as Field[])[0]).toEqual(
      field('order_id', { alias: 'Order ID' })
    );
  });

  it('follows nested fields', async () => {
    const nested = dataMart(ids.orders, 'Orders', null, [
      field('customer', {
        type: 'RECORD',
        alias: 'Customer',
        fields: [field('email', { description: 'Contact email' })],
      }),
    ]);
    const { service } = createService([nested]);
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`);

    const { schema } = await service.applyInheritance(
      b,
      schemaOf([field('customer', { type: 'RECORD', fields: [field('email'), field('phone')] })])
    );

    const [customer] = schema!.fields as unknown as Field[];
    const [email, phone] = customer.fields as Field[];
    expect(email).toMatchObject({ description: 'Contact email', inheritedFrom: expect.anything() });
    expect(phone).not.toHaveProperty('inheritedFrom');
  });

  it('reports no change and loads nothing for a Data Mart without references', async () => {
    const { service, resolver } = createService([orders]);
    const schema = schemaOf([field('order_id', { alias: 'Mine' })]);

    const result = await service.applyInheritance(dataMart(ids.b, 'B', 'SELECT 1'), schema);

    expect(result).toEqual({ schema, changed: false });
    expect(resolver.findReferencedDataMarts).not.toHaveBeenCalled();
  });

  it('drops an inheritedFrom a client put on a calculated field', async () => {
    const { service } = createService([orders]);
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`);
    const forged = field('margin', {
      calculated: { formula: 'SUM(x)' },
      inheritedFrom: { dataMartId: ids.orders, dataMartTitle: 'Orders' },
    });

    const { schema } = await service.applyInheritance(b, schemaOf([forged]));

    expect(schema?.fields[0]).not.toHaveProperty('inheritedFrom');
  });

  it('reports no change when the inherited values are already in place', async () => {
    const { service } = createService([orders]);
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`);
    const first = await service.applyInheritance(b, schemaOf([field('order_id')]));

    const second = await service.applyInheritance(b, first.schema);

    expect(second.changed).toBe(false);
  });
});

describe('DataMartSchemaInheritanceService.propagateFrom', () => {
  it('updates the Data Marts that reference the source, and the ones that reference them', async () => {
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`, [
      field('channel'),
    ]);
    const c = dataMart(ids.costs, 'C', `SELECT * FROM ${ref('B', ids.b)} b`, [field('channel')]);
    const updatedB = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`, [
      field('channel', {
        alias: 'Sales channel',
        inheritedFrom: { dataMartId: ids.orders, dataMartTitle: 'Orders' },
      }),
    ]);
    const { service, repository } = createService([orders, updatedB], {
      [ids.orders]: [b],
      [ids.b]: [c],
    });

    const updated = await service.propagateFrom(orders);

    expect(updated).toEqual([
      { id: ids.b, projectId: 'project-1' },
      { id: ids.costs, projectId: 'project-1' },
    ]);
    expect(repository.update).toHaveBeenCalledWith(ids.b, {
      schema: expect.objectContaining({
        fields: [expect.objectContaining({ alias: 'Sales channel' })],
      }),
    });
    expect(repository.update).toHaveBeenCalledWith(ids.costs, {
      schema: expect.objectContaining({
        fields: [
          expect.objectContaining({
            alias: 'Sales channel',
            inheritedFrom: { dataMartId: ids.b, dataMartTitle: 'B' },
          }),
        ],
      }),
    });
  });

  it('writes onto the schema as saved now, keeping a field added after the lookup', async () => {
    const sql = `SELECT * FROM ${ref('Orders', ids.orders)} o`;
    const b = dataMart(ids.b, 'B', sql, [field('channel')]);
    const { service, repository } = createService([orders], { [ids.orders]: [b] });
    const mine = field('margin_pct', { calculated: { formula: 'x / y' }, alias: 'Margin %' });
    repository.findOne.mockResolvedValueOnce(dataMart(ids.b, 'B', sql, [field('channel'), mine]));

    await service.propagateFrom(orders);

    expect(repository.update).toHaveBeenCalledWith(ids.b, {
      schema: expect.objectContaining({
        fields: [expect.objectContaining({ name: 'channel', alias: 'Sales channel' }), mine],
      }),
    });
  });

  it('never fails the save that triggered it', async () => {
    const { service, resolver } = createService([orders]);
    resolver.findReferencingDataMarts.mockRejectedValue(new Error('database is down'));

    await expect(service.propagateFrom(orders)).resolves.toEqual([]);
  });

  it('releases the fields of the Data Marts that referenced a deleted one', async () => {
    const inherited = field('channel', {
      alias: 'Sales channel',
      inheritedFrom: { dataMartId: ids.orders, dataMartTitle: 'Orders' },
    });
    const b = dataMart(ids.b, 'B', `SELECT * FROM ${ref('Orders', ids.orders)} o`, [inherited]);
    // Orders is deleted: the lookup of referenced Data Marts no longer returns it.
    const { service, repository } = createService([], { [ids.orders]: [b] });

    await service.propagateFrom(orders);

    expect(repository.update).toHaveBeenCalledWith(ids.b, {
      schema: expect.objectContaining({
        fields: [field('channel', { alias: 'Sales channel' })],
      }),
    });
  });
});
