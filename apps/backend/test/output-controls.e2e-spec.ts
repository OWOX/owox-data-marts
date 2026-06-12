import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';

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
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
    expectDisconnectedColumns(putRes, ['users.userRole']);
  });

  it('PUT pre-join filter with aliasPath="main" → 400 with Zod shape error', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Pre-join on home',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        filterConfig: [
          { column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'main' },
        ],
      });
    expect(res.status).toBe(400);
    // Owned by Zod superRefine — FE consumes the schema-level issue, not a validator code.
    const body = JSON.stringify(res.body);
    expect(body).toContain('pre-join filter on the home data mart');
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
