import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartSqlReferenceErrorCode } from '../sql-references/data-mart-sql-reference.errors';
import { Action, EntityType } from './access-decision';
import { DataMartSqlReferenceValidator } from './data-mart-sql-reference-validator.service';

const ids = {
  b: 'bbbbbbbb-0000-4000-8000-000000000001',
  orders: 'aaaaaaaa-0000-4000-8000-000000000002',
  draft: 'cccccccc-0000-4000-8000-000000000003',
};

const ref = (title: string, id: string) => `[${title}](dm:${id})`;
const bigquery = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY, projectId: 'project-1' };

function dataMart(id: string, title: string, overrides: Partial<DataMart> = {}): DataMart {
  return Object.assign(new DataMart(), {
    id,
    title,
    projectId: 'project-1',
    status: DataMartStatus.PUBLISHED,
    storage: bigquery,
    definition: { sqlQuery: 'SELECT 1' },
    ...overrides,
  });
}

function createValidator(store: DataMart[], canAccess = true) {
  const sqlReferenceResolver = {
    findReferencedDataMarts: jest.fn(async (wanted: readonly string[]) =>
      store.filter(dm => wanted.includes(dm.id))
    ),
  };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canAccess) };
  const validator = new DataMartSqlReferenceValidator(
    sqlReferenceResolver as never,
    accessDecisionService as never
  );
  return { validator, accessDecisionService };
}

const b = dataMart(ids.b, 'Retail orders');

describe('DataMartSqlReferenceValidator.prepareForSave', () => {
  it('returns SQL without references as is', async () => {
    const { validator } = createValidator([]);

    await expect(validator.prepareForSave({ dataMart: b, sqlQuery: 'SELECT 1' })).resolves.toBe(
      'SELECT 1'
    );
  });

  it('refreshes each reference title from the referenced Data Mart', async () => {
    const { validator } = createValidator([dataMart(ids.orders, 'Orders [all]')]);

    const sql = await validator.prepareForSave({
      dataMart: b,
      sqlQuery: `SELECT * FROM ${ref('Old name', ids.orders)} o`,
    });

    expect(sql).toBe(String.raw`SELECT * FROM [Orders \[all\]](dm:${ids.orders}) o`);
  });

  it('checks that the saving user can use a newly referenced Data Mart in reports', async () => {
    const { validator, accessDecisionService } = createValidator([dataMart(ids.orders, 'Orders')]);

    await validator.prepareForSave({
      dataMart: b,
      sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o`,
      userId: 'user-1',
      roles: ['editor'],
    });

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ids.orders,
      Action.USE,
      'project-1'
    );
  });

  it('refuses a new reference the saving user cannot use', async () => {
    const { validator } = createValidator([dataMart(ids.orders, 'Orders')], false);

    await expect(
      validator.prepareForSave({
        dataMart: b,
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o`,
        userId: 'user-1',
      })
    ).rejects.toMatchObject({
      code: DataMartSqlReferenceErrorCode.ACCESS_DENIED,
      message:
        'You do not have access to Data Mart "Orders", so you cannot save SQL that references it. ' +
        'Ask its owner to share it with you.',
    });
  });

  // The saved query reads the referenced Data Mart for everyone who reads this one, so a
  // reference an earlier version had is checked against whoever saves it now.
  it('refuses a co-editor who cannot use a Data Mart the query already referenced', async () => {
    const { validator, accessDecisionService } = createValidator(
      [dataMart(ids.orders, 'Orders')],
      false
    );

    await expect(
      validator.prepareForSave({
        dataMart: b,
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o WHERE x = 2`,
        userId: 'co-editor',
      })
    ).rejects.toMatchObject({ code: DataMartSqlReferenceErrorCode.ACCESS_DENIED });
    expect(accessDecisionService.canAccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'itself',
      [] as DataMart[],
      ids.b,
      DataMartSqlReferenceErrorCode.SELF,
      'A Data Mart cannot reference itself.',
    ],
    [
      'a missing Data Mart',
      [] as DataMart[],
      ids.orders,
      DataMartSqlReferenceErrorCode.NOT_FOUND,
      'Referenced Data Mart "X" was not found. It may have been deleted.',
    ],
    [
      'a Data Mart in another Storage',
      [dataMart(ids.orders, 'Orders', { storage: { ...bigquery, id: 'storage-2' } as never })],
      ids.orders,
      DataMartSqlReferenceErrorCode.OTHER_STORAGE,
      'Data Mart "Orders" is in another Storage. Only Data Marts from the same Storage can be referenced.',
    ],
    [
      'a draft',
      [dataMart(ids.draft, 'Draft', { status: DataMartStatus.DRAFT })],
      ids.draft,
      DataMartSqlReferenceErrorCode.NOT_PUBLISHED,
      'Data Mart "Draft" is not published yet, so it cannot be referenced.',
    ],
  ])('refuses a reference to %s', async (_case, store, id, code, message) => {
    const { validator } = createValidator(store);

    await expect(
      validator.prepareForSave({ dataMart: b, sqlQuery: `SELECT * FROM ${ref('X', id)} x` })
    ).rejects.toMatchObject({ code, message });
  });

  it('refuses a reference that leads back to the saved Data Mart', async () => {
    const { validator } = createValidator([
      dataMart(ids.orders, 'Orders', {
        definition: { sqlQuery: `SELECT * FROM ${ref('Draft', ids.draft)} d` },
      }),
      dataMart(ids.draft, 'Middle', {
        definition: { sqlQuery: `SELECT * FROM ${ref('Retail orders', ids.b)} r` },
      }),
    ]);

    await expect(
      validator.prepareForSave({
        dataMart: b,
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o`,
      })
    ).rejects.toMatchObject({
      code: DataMartSqlReferenceErrorCode.CYCLE,
      message:
        'Data Mart "Middle" already references this Data Mart, so referencing it back would create a loop.',
    });
  });

  it('refuses references on a Legacy Google BigQuery storage', async () => {
    const { validator } = createValidator([]);
    const legacy = dataMart(ids.b, 'Legacy', {
      storage: { ...bigquery, type: DataStorageType.LEGACY_GOOGLE_BIGQUERY } as never,
    });

    await expect(
      validator.prepareForSave({
        dataMart: legacy,
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o`,
      })
    ).rejects.toMatchObject({ code: DataMartSqlReferenceErrorCode.LEGACY_STORAGE });
  });
});
