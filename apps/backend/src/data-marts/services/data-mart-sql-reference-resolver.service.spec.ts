import { FindOperator } from 'typeorm';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartSqlReferenceErrorCode } from '../sql-references/data-mart-sql-reference.errors';
import { DataMartSqlReferenceResolver } from './data-mart-sql-reference-resolver.service';

const ids = {
  b: 'bbbbbbbb-0000-4000-8000-000000000001',
  orders: 'aaaaaaaa-0000-4000-8000-000000000002',
  costs: 'cccccccc-0000-4000-8000-000000000003',
  nested: 'dddddddd-0000-4000-8000-000000000004',
  elsewhere: 'eeeeeeee-0000-4000-8000-000000000005',
};

const ref = (title: string, id: string) => `[${title}](dm:${id})`;

function storageOf(type: DataStorageType, id = 'storage-1') {
  return { id, type, projectId: 'project-1', config: {}, credentialId: 'cred-1' };
}

function dataMart(
  id: string,
  title: string,
  definition: Record<string, unknown> | undefined,
  storage = storageOf(DataStorageType.GOOGLE_BIGQUERY)
): DataMart {
  return Object.assign(new DataMart(), {
    id,
    title,
    projectId: 'project-1',
    status: DataMartStatus.PUBLISHED,
    storage,
    definition,
  });
}

function createResolver(store: DataMart[]) {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(store),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    find: jest.fn(async ({ where }: { where: { id: FindOperator<string[]>; projectId: string } }) =>
      store.filter(dm => where.id.value.includes(dm.id) && dm.projectId === where.projectId)
    ),
  };
  const queryBuilderFacade = {
    buildQuery: jest.fn(
      async (_type: DataStorageType, definition: { fullyQualifiedName: string }) =>
        `SELECT * FROM \`${definition.fullyQualifiedName}\``
    ),
  };
  const createViewExecutorFacade = {
    createView: jest.fn(
      async (_type: DataStorageType, _credentials: unknown, _config: unknown, name: string) => ({
        fullyQualifiedName: `internal.${name}`,
      })
    ),
  };
  const credentialsResolver = { resolve: jest.fn().mockResolvedValue({}) };
  const resolver = new DataMartSqlReferenceResolver(
    repository as never,
    queryBuilderFacade as never,
    createViewExecutorFacade as never,
    credentialsResolver as never
  );
  return { resolver, repository, queryBuilder, queryBuilderFacade, createViewExecutorFacade };
}

describe('DataMartSqlReferenceResolver', () => {
  const orders = dataMart(ids.orders, 'Orders', {
    sqlQuery: 'WITH clean AS (SELECT * FROM shop.orders) SELECT * FROM clean;',
  });
  const costs = dataMart(ids.costs, 'Daily costs', { fullyQualifiedName: 'ads.costs' });

  describe('expandSql', () => {
    it('inlines a referenced SQL Data Mart as a labelled derived table', async () => {
      const { resolver } = createResolver([orders]);
      const b = dataMart(ids.b, 'Retail orders', {
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} AS o WHERE o.order_type = 'Retail'`,
      });

      const definition = await resolver.resolveDefinition(b);

      expect(definition).toEqual({
        sqlQuery:
          'SELECT * FROM (\n' +
          `-- Data Mart: Orders (${ids.orders})\n` +
          'WITH clean AS (SELECT * FROM shop.orders) SELECT * FROM clean\n' +
          ") AS o WHERE o.order_type = 'Retail'",
      });
    });

    it('reads any other Data Mart through the storage query builder', async () => {
      const { resolver, queryBuilderFacade } = createResolver([costs]);

      const sql = await resolver.expandSql(`SELECT * FROM ${ref('Costs', ids.costs)} c`, {
        projectId: 'project-1',
        storage: costs.storage,
      });

      expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
        DataStorageType.GOOGLE_BIGQUERY,
        costs.definition
      );
      expect(sql).toBe(
        `SELECT * FROM (\n-- Data Mart: Daily costs (${ids.costs})\nSELECT * FROM \`ads.costs\`\n) c`
      );
    });

    it('adds a distinct alias where the query gives none', async () => {
      const { resolver } = createResolver([costs]);

      const sql = await resolver.expandSql(
        `SELECT * FROM ${ref('C', ids.costs)} JOIN ${ref('C', ids.costs)} USING (d)`,
        { projectId: 'project-1', storage: costs.storage }
      );

      expect(sql).toContain(') AS dm_cccccccc JOIN (');
      expect(sql).toContain(') AS dm_cccccccc_2 USING (d)');
    });

    it('resolves nested references all the way down', async () => {
      const nested = dataMart(ids.nested, 'Nested', {
        sqlQuery: `SELECT * FROM ${ref('Costs', ids.costs)} AS c`,
      });
      const { resolver } = createResolver([nested, costs]);

      const sql = await resolver.expandSql(`SELECT * FROM ${ref('N', ids.nested)} AS n`, {
        projectId: 'project-1',
        storage: costs.storage,
      });

      expect(sql).toContain('-- Data Mart: Nested');
      expect(sql).toContain('-- Data Mart: Daily costs');
      expect(sql).toContain('SELECT * FROM `ads.costs`');
      expect(sql).not.toContain('](dm:');
    });

    it('leaves SQL without references untouched and loads nothing', async () => {
      const { resolver, repository } = createResolver([]);
      const definition = { sqlQuery: 'SELECT 1' };
      const plain = dataMart(ids.b, 'B', definition);

      expect(await resolver.resolveDefinition(plain)).toBe(definition);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a deleted or unknown Data Mart',
        [] as DataMart[],
        DataMartSqlReferenceErrorCode.NOT_FOUND,
        /Referenced Data Mart "Orders" was not found/,
      ],
      [
        'a Data Mart in another Storage',
        [
          dataMart(
            ids.orders,
            'Orders',
            { sqlQuery: 'SELECT 1' },
            storageOf(DataStorageType.GOOGLE_BIGQUERY, 'storage-2')
          ),
        ],
        DataMartSqlReferenceErrorCode.OTHER_STORAGE,
        /"Orders" is in another Storage/,
      ],
      [
        'a Data Mart without an input source',
        [dataMart(ids.orders, 'Orders', undefined)],
        DataMartSqlReferenceErrorCode.NO_DEFINITION,
        /"Orders" has no input source yet/,
      ],
      [
        'a multi-statement Data Mart',
        [dataMart(ids.orders, 'Orders', { sqlQuery: 'DECLARE x INT64; SELECT x' })],
        DataMartSqlReferenceErrorCode.MULTI_STATEMENT,
        /"Orders" runs several SQL statements/,
      ],
    ])('refuses %s', async (_case, store, code, message) => {
      const { resolver } = createResolver(store);

      await expect(
        resolver.expandSql(`SELECT * FROM ${ref('Orders', ids.orders)} o`, {
          projectId: 'project-1',
          storage: storageOf(DataStorageType.GOOGLE_BIGQUERY),
        })
      ).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
    });

    it('refuses a reference that leads back to the Data Mart being resolved', async () => {
      const looping = dataMart(ids.orders, 'Orders', {
        sqlQuery: `SELECT * FROM ${ref('B', ids.b)} b`,
      });
      const b = dataMart(ids.b, 'B', { sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o` });
      const { resolver } = createResolver([looping, b]);

      await expect(resolver.resolveDefinition(b)).rejects.toMatchObject({
        code: DataMartSqlReferenceErrorCode.CYCLE,
      });
    });

    it('refuses a loop between two referenced Data Marts instead of waiting forever', async () => {
      // B and C both sit under the root: each one's expansion reaches the other.
      const b = dataMart(ids.b, 'B', { sqlQuery: `SELECT * FROM ${ref('C', ids.costs)} c` });
      const c = dataMart(ids.costs, 'C', { sqlQuery: `SELECT * FROM ${ref('B', ids.b)} b` });
      const { resolver } = createResolver([b, c]);

      await expect(
        resolver.expandSql(
          `SELECT * FROM ${ref('B', ids.b)} b JOIN ${ref('C', ids.costs)} c USING (d)`,
          { projectId: 'project-1', storage: b.storage }
        )
      ).rejects.toMatchObject({ code: DataMartSqlReferenceErrorCode.CYCLE });
    });

    it('refuses SQL that grows past the length limit, naming the Data Mart', async () => {
      const wide = dataMart(ids.orders, 'Wide', {
        sqlQuery: `SELECT '${'x'.repeat(300_000)}' AS s`,
      });
      const fourTimes = [0, 1, 2, 3].map(n => `${ref('Wide', ids.orders)} w${n}`).join(', ');
      const fanOut = dataMart(ids.nested, 'Fan-out', { sqlQuery: `SELECT * FROM ${fourTimes}` });
      const { resolver } = createResolver([wide, fanOut]);
      const scope = { projectId: 'project-1', storage: wide.storage };

      await expect(
        resolver.expandSql(`SELECT * FROM ${ref('Fan-out', ids.nested)} f`, scope)
      ).rejects.toMatchObject({
        code: DataMartSqlReferenceErrorCode.TOO_LONG,
        message: expect.stringContaining(
          'The SQL of Data Mart "Fan-out" becomes longer than 1,000,000 characters'
        ),
      });
      await expect(resolver.expandSql(`SELECT * FROM ${fourTimes}`, scope)).rejects.toMatchObject({
        code: DataMartSqlReferenceErrorCode.TOO_LONG,
        message: expect.stringMatching(/^This SQL becomes longer/),
      });
    });

    it('uses the technical view for a recursive query', async () => {
      const tree = dataMart(ids.orders, 'Tree', {
        sqlQuery: 'WITH RECURSIVE t AS (SELECT 1 AS n) SELECT * FROM t',
      });
      const { resolver, createViewExecutorFacade } = createResolver([tree]);

      const sql = await resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, {
        projectId: 'project-1',
        storage: tree.storage,
      });

      expect(createViewExecutorFacade.createView).toHaveBeenCalledWith(
        DataStorageType.GOOGLE_BIGQUERY,
        {},
        {},
        'view_aaaaaaaa_0000_4000_8000_000000000002',
        'WITH RECURSIVE t AS (SELECT 1 AS n) SELECT * FROM t'
      );
      expect(sql).toBe('SELECT * FROM internal.view_aaaaaaaa_0000_4000_8000_000000000002 t');
    });

    describe('technical view refresh', () => {
      const recursive = 'WITH RECURSIVE t AS (SELECT 1 AS n) SELECT * FROM t';
      const scopeOf = (tree: DataMart) => ({ projectId: 'project-1', storage: tree.storage });
      const twoReferences = `SELECT * FROM ${ref('Tree', ids.orders)} a JOIN ${ref('Tree', ids.orders)} b USING (n)`;

      it('runs the DDL once for repeated references and repeated resolves of the same SQL', async () => {
        const tree = dataMart(ids.orders, 'Tree', { sqlQuery: recursive });
        const { resolver, createViewExecutorFacade } = createResolver([tree]);

        await resolver.expandSql(twoReferences, scopeOf(tree));
        await resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, scopeOf(tree));

        expect(createViewExecutorFacade.createView).toHaveBeenCalledTimes(1);
      });

      it('refreshes the view again once the referenced SQL changes', async () => {
        const tree = dataMart(ids.orders, 'Tree', { sqlQuery: recursive });
        const { resolver, createViewExecutorFacade } = createResolver([tree]);

        await resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, scopeOf(tree));
        tree.definition = { sqlQuery: `${recursive} WHERE n > 0` };
        await resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, scopeOf(tree));

        expect(createViewExecutorFacade.createView).toHaveBeenCalledTimes(2);
        expect(createViewExecutorFacade.createView).toHaveBeenLastCalledWith(
          DataStorageType.GOOGLE_BIGQUERY,
          {},
          {},
          'view_aaaaaaaa_0000_4000_8000_000000000002',
          `${recursive} WHERE n > 0`
        );
      });

      it('tries again after a failed refresh', async () => {
        const tree = dataMart(ids.orders, 'Tree', { sqlQuery: recursive });
        const { resolver, createViewExecutorFacade } = createResolver([tree]);
        createViewExecutorFacade.createView.mockRejectedValueOnce(new Error('Access Denied'));

        await expect(
          resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, scopeOf(tree))
        ).rejects.toThrow('Access Denied');
        await resolver.expandSql(`SELECT * FROM ${ref('Tree', ids.orders)} t`, scopeOf(tree));

        expect(createViewExecutorFacade.createView).toHaveBeenCalledTimes(2);
      });
    });

    describe('on Redshift', () => {
      const redshift = storageOf(DataStorageType.AWS_REDSHIFT);
      const withCte = dataMart(
        ids.orders,
        'Orders',
        { sqlQuery: 'WITH c AS (SELECT 1 AS x) SELECT * FROM c' },
        redshift
      );

      it('inlines a query with WITH in the main FROM', async () => {
        const { resolver, createViewExecutorFacade } = createResolver([withCte]);

        const sql = await resolver.expandSql(`SELECT * FROM ${ref('Orders', ids.orders)} o`, {
          projectId: 'project-1',
          storage: redshift,
        });

        expect(sql).toContain('WITH c AS (SELECT 1 AS x) SELECT * FROM c\n) o');
        expect(createViewExecutorFacade.createView).not.toHaveBeenCalled();
      });

      it('uses the technical view for a query with WITH inside a CTE body', async () => {
        const { resolver } = createResolver([withCte]);

        const sql = await resolver.expandSql(
          `WITH r AS (SELECT * FROM ${ref('Orders', ids.orders)} o) SELECT * FROM r`,
          { projectId: 'project-1', storage: redshift }
        );

        expect(sql).toBe(
          'WITH r AS (SELECT * FROM internal.view_aaaaaaaa_0000_4000_8000_000000000002 o) ' +
            'SELECT * FROM r'
        );
      });
    });
  });

  describe('inlineSource', () => {
    it('returns the resolved query as a derived table for a Data Mart with references', async () => {
      const { resolver } = createResolver([costs]);
      const b = dataMart(ids.b, 'B', { sqlQuery: `SELECT * FROM ${ref('C', ids.costs)} c;` });

      const inline = await resolver.inlineSource(b);

      expect(inline).toMatch(/^\(\n-- Data Mart: B \(bbbbbbbb-.*\)\nSELECT \* FROM \(\n/);
      expect(inline).toMatch(/\) c\n\)$/);
    });

    it('keeps the view for a Data Mart without references, and on Redshift', async () => {
      const { resolver } = createResolver([costs]);

      expect(
        await resolver.inlineSource(dataMart(ids.b, 'B', { sqlQuery: 'SELECT 1' }))
      ).toBeNull();
      expect(
        await resolver.inlineSource(
          dataMart(
            ids.b,
            'B',
            { sqlQuery: `SELECT * FROM ${ref('C', ids.costs)} c` },
            storageOf(DataStorageType.AWS_REDSHIFT)
          )
        )
      ).toBeNull();
    });
  });

  describe('withResolvedDataMart', () => {
    it('returns the same report when nothing needs resolving', async () => {
      const { resolver } = createResolver([]);
      const report = { dataMart: dataMart(ids.b, 'B', { sqlQuery: 'SELECT 1' }) };

      expect(await resolver.withResolvedDataMart(report)).toBe(report);
    });

    it('returns a copy with a resolved Data Mart that keeps its prototype', async () => {
      const { resolver } = createResolver([costs]);
      const original = dataMart(ids.b, 'B', { sqlQuery: `SELECT * FROM ${ref('C', ids.costs)} c` });
      const report = { dataMart: original, title: 'R' };

      const resolved = await resolver.withResolvedDataMart(report);

      expect(resolved).not.toBe(report);
      expect(resolved.title).toBe('R');
      expect(resolved.dataMart).toBeInstanceOf(DataMart);
      expect((resolved.dataMart.definition as { sqlQuery: string }).sqlQuery).not.toContain(
        '](dm:'
      );
      expect((original.definition as { sqlQuery: string }).sqlQuery).toContain('](dm:');
    });
  });

  describe('findReferencingDataMarts', () => {
    it('narrows by project, Storage and text, then keeps only real references', async () => {
      const referencing = dataMart(ids.b, 'Retail orders', {
        sqlQuery: `SELECT * FROM ${ref('Orders', ids.orders)} o`,
      });
      const onlyMentions = dataMart(ids.nested, 'Notes', {
        sqlQuery: `SELECT 1 -- was ${ref('Orders', ids.orders)}`,
      });
      const { resolver, queryBuilder } = createResolver([referencing, onlyMentions]);

      const found = await resolver.findReferencingDataMarts(orders);

      expect(found).toEqual([referencing]);
      expect(queryBuilder.where).toHaveBeenCalledWith('dm.projectId = :projectId', {
        projectId: 'project-1',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('dm.storage = :storageId', {
        storageId: 'storage-1',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        `JSON_EXTRACT(dm.definition, '$.sqlQuery') LIKE :marker`,
        { marker: `%(dm:${ids.orders})%` }
      );
    });
  });
});
