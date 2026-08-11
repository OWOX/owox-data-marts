import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  setupBlendedReportPrerequisites,
  DataDestinationBuilder,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataDestinationType } from 'src/data-marts/data-destination-types/enums/data-destination-type.enum';

// e2e coverage for the output-controls feature on the report API surface
// (limit/filter/sort persistence + class-validator and validator-service
// rejection paths). SQL-emission paths are covered by unit tests in
// abstract-blended-query-builder.spec.ts and bigquery-clause-renderer.spec.ts.
//
// Athena output-controls SQL emission is covered by unit specs
// (athena-clause-renderer.spec.ts, athena-query.builder.spec.ts,
// athena-blended-query-builder.spec.ts). Capability acceptance is asserted in
// output-controls-capability.service.spec.ts. No live-warehouse e2e by design:
// the /generated-sql path for SQL-defined data marts calls CreateViewService
// which requires real storage credentials — unavailable in the SQLite test harness.

describe('Output controls API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let dataDestinationId: string;
  let reportId: string;

  function expectDisconnectedColumns(res: supertest.Response, unknownColumns: string[]): void {
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Disconnected columns:');
    expect(res.body.message).toContain(
      'They are missing from the current Data Mart output schema.'
    );
    expect(res.body.errorDetails).toEqual({ unknownColumns, dataMartId });
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;

    const schemaRes = await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(AUTH_HEADER)
      .send({
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'col_a', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
            { name: 'col_b', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
          ],
        },
      });
    expect(schemaRes.status).toBe(200);

    // Seed baseline report. LOOKER_STUDIO destinations use a deterministic
    // UUID v5 derived from (dataMartId, dataDestinationId), so there can be
    // only one such report per pair — subsequent POST attempts collide.
    const createRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withDataMartId(dataMartId)
          .withDataDestinationId(dataDestinationId)
          .build()
      );
    expect(createRes.status).toBe(201);
    reportId = createRes.body.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('PUT updates report with limit-only output control and GET returns it', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Limit only',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
        columnConfig: ['col_a', 'col_b'],
        limitConfig: 1000,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      columnConfig: ['col_a', 'col_b'],
      limitConfig: 1000,
    });

    const getRes = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({
      columnConfig: ['col_a', 'col_b'],
      limitConfig: 1000,
    });
  });

  it('PUT rejects sort on existing non-selected column with SORT_COLUMN_NOT_SELECTED', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Bad sort',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        sortConfig: [{ column: 'col_b', direction: 'asc' }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('SORT_COLUMN_NOT_SELECTED');
  });

  it('PUT with filter on a column missing from the data mart schema reports disconnected columns', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Filter on unknown column',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: [{ column: 'definitely_does_not_exist', operator: 'is_empty' }],
      });

    expectDisconnectedColumns(res, ['definitely_does_not_exist']);
  });

  it('PUT rejects limitConfig <= 0 via class-validator @IsPositive', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Bad limit',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        limitConfig: 0,
      });

    expect(res.status).toBe(400);
  });

  it('PUT rejects limitConfig > 10_000_000 via class-validator @Max', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Too big limit',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        limitConfig: 99_999_999,
      });

    expect(res.status).toBe(400);
  });

  it('PUT rejects sortConfig with > 10 entries via @ArrayMaxSize', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Too many sorts',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        sortConfig: Array.from({ length: 11 }, () => ({
          column: 'col_a',
          direction: 'asc',
        })),
      });

    expect(res.status).toBe(400);
  });

  it('PUT clears output controls when nullable fields are set to null', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Clear controls',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: null,
        sortConfig: null,
        limitConfig: null,
      });

    expect(res.status).toBe(200);
    const getRes = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(getRes.status).toBe(200);
    expect(getRes.body.filterConfig).toBeNull();
    expect(getRes.body.sortConfig).toBeNull();
    expect(getRes.body.limitConfig).toBeNull();
  });

  it('PUT pre-join filter on simple report reports disconnected columns', async () => {
    const putRes = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Pre-join on simple',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: [
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
        ],
      });
    expectDisconnectedColumns(putRes, ['users__userRole']);
  });

  it('PUT pre-join filter on home mart column → 400 disconnected (home mart not slicable)', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Pre-join on home',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: [{ column: 'main__x', operator: 'eq', value: 1, placement: 'pre-join' }],
      });
    // No Zod superRefine on aliasPath="main" in the new model — the unified column
    // name "main__x" is simply not found in the blended field index, so it flows
    // through as a disconnected column (FILTER_COLUMN_UNKNOWN path).
    expectDisconnectedColumns(res, ['main__x']);
  });

  // The READ path is the one with no other coverage: `Report.uniqueCountConfig` runs its stored
  // value back through `UniqueCountConfigSchema` on every load, so a shape the transformer refuses
  // does not reject a bad write — it bricks a report that saved cleanly, with nothing in the
  // editor able to open it again. Both stored shapes have to survive a full round trip (#6792).
  describe('uniqueCountConfig persistence round trip', () => {
    let blendedReportId: string;
    let blendedDestinationId: string;

    beforeAll(async () => {
      const prereqs = await setupBlendedReportPrerequisites(agent);

      // Schemas with a declared primary key on both marts: the main one gates `''`
      // (UNIQUE_COUNT_REQUIRES_PRIMARY_KEY) and the joined one makes `users` an 'available'
      // Unique Count source rather than one the create call refuses.
      const schemas: Array<[string, Record<string, unknown>]> = [
        [
          prereqs.mainDataMartId,
          {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'event_id',
                type: 'STRING',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                isPrimaryKey: true,
              },
              { name: 'user_id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
              { name: 'amount', type: 'NUMERIC', mode: 'NULLABLE', status: 'CONNECTED' },
            ],
          },
        ],
        [
          prereqs.usersDataMartId,
          {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'id',
                type: 'STRING',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                isPrimaryKey: true,
              },
              { name: 'role', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
            ],
          },
        ],
      ];
      for (const [id, schema] of schemas) {
        const res = await agent
          .put(`/api/data-marts/${id}/schema`)
          .set(AUTH_HEADER)
          .send({ schema });
        expect(res.status).toBe(200);
      }

      // A LOOKER_STUDIO report id is a UUID v5 of (dataMartId, dataDestinationId), so the
      // prerequisites' own report already owns the pair — a second destination is what makes a
      // POST (rather than a PUT onto that report) possible at all.
      const destRes = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Unique Count round trip')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(destRes.status).toBe(201);
      blendedDestinationId = destRes.body.id;
      await agent
        .put(`/api/data-destinations/${blendedDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });

      const createRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send({
          title: 'Joined Unique Count',
          dataMartId: prereqs.mainDataMartId,
          dataDestinationId: blendedDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['event_id'],
          uniqueCountConfig: ['', 'users'],
        });
      expect(createRes.status).toBe(201);
      blendedReportId = createRes.body.id;
    }, 120_000);

    const putUniqueCountConfig = (uniqueCountConfig: unknown) =>
      agent
        .put(`/api/reports/${blendedReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Joined Unique Count',
          dataDestinationId: blendedDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['event_id'],
          uniqueCountConfig,
        });

    // One test, not four: every write below lands on the same report, so as separate cases they
    // would only pass in declaration order — and `--testNamePattern` or any future randomization
    // would silently reorder them.
    it('round-trips the per-source array, the legacy boolean, an empty list and null', async () => {
      const created = await agent.get(`/api/reports/${blendedReportId}`).set(AUTH_HEADER);
      expect(created.status).toBe(200);
      // Deep equality, not toMatchObject: order and the empty-string main-Data-Mart entry are both
      // load-bearing, and `['']` read back as `true` (or dropped) would be a silent migration.
      expect(created.body.uniqueCountConfig).toEqual(['', 'users']);
      expect(created.body.columnConfig).toEqual(['event_id']);

      expect((await putUniqueCountConfig(true)).status).toBe(200);
      const legacy = await agent.get(`/api/reports/${blendedReportId}`).set(AUTH_HEADER);
      expect(legacy.body.uniqueCountConfig).toBe(true);

      // `[]` is TRUTHY, and the released Google Sheets add-on reads this field as a boolean — so an
      // empty list has to persist as the value every client already reads as "off".
      expect((await putUniqueCountConfig([])).status).toBe(200);
      const emptied = await agent.get(`/api/reports/${blendedReportId}`).set(AUTH_HEADER);
      expect(emptied.body.uniqueCountConfig).toBeNull();

      expect((await putUniqueCountConfig(null)).status).toBe(200);
      const cleared = await agent.get(`/api/reports/${blendedReportId}`).set(AUTH_HEADER);
      expect(cleared.body.uniqueCountConfig).toBeNull();
    });

    // The rule is unit-tested; this pins that it survives the real controller → DTO → validator
    // chain, which is the boundary the metric's whole "selectable and sortable only" contract
    // leans on.
    it('PUT refuses a filter on a joined Unique Count through the real HTTP chain', async () => {
      const res = await agent
        .put(`/api/reports/${blendedReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Joined Unique Count',
          dataDestinationId: blendedDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['event_id'],
          uniqueCountConfig: ['users'],
          filterConfig: [{ column: 'users__unique_count', operator: 'eq', value: 5 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.details.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'UNIQUE_COUNT_FILTER_UNSUPPORTED',
            column: 'users__unique_count',
          }),
        ])
      );
    });

    // MCP's add_report copies `fields` straight into the projection, so this used to save clean and
    // fail every subsequent run — after the Google Sheet already existed.
    it('PUT refuses a Unique Count column named in the projection', async () => {
      const res = await agent
        .put(`/api/reports/${blendedReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Joined Unique Count',
          dataDestinationId: blendedDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['event_id', 'users__unique_count'],
          uniqueCountConfig: null,
        });

      expect(res.status).toBe(400);
      expect(res.body.details.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE',
            column: 'users__unique_count',
          }),
        ])
      );
    });
  });

  it('PUT rejects filterConfig with > 50 entries via @ArrayMaxSize(50)', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      column: 'col_a',
      operator: 'eq',
      value: `v${i}`,
    }));
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Too many filters',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: tooMany,
      });
    expect(res.status).toBe(400);
  });
});
