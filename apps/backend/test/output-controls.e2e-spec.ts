import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';

// e2e coverage for the output-controls feature on the report API surface.
//
// Tasks 22 (SQL execution) and 23 (blended e2e) require a real BigQuery
// project and view-creation roundtrip. They are covered by unit tests:
//   - bigquery-clause-renderer.spec.ts (operator → SQL fragment matrix)
//   - bigquery-query.builder.spec.ts (WHERE/ORDER BY/LIMIT composition)
//   - abstract-blended-query-builder.spec.ts (output controls on blended)
//   - blended-report-data.service.spec.ts (filter-on-non-selected chain)
//
// What this file covers (Task 24 + DTO surface):
//   - happy-path persistence/retrieval of limit-only output controls
//   - validator-service rejection: SORT_COLUMN_NOT_SELECTED, FILTER_COLUMN_UNKNOWN
//   - class-validator rejections: limit <= 0, limit > 10_000_000, sortConfig length > 10

describe('Output controls API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let dataDestinationId: string;
  let reportId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;

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

  it('PUT rejects sort on non-selected column with SORT_COLUMN_NOT_SELECTED', async () => {
    const res = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Bad sort',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['col_a'],
        sortConfig: [{ column: 'not_in_columns', direction: 'asc' }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('SORT_COLUMN_NOT_SELECTED');
  });

  it('PUT with filter on a column missing from the data mart schema reports FILTER_COLUMN_UNKNOWN', async () => {
    // The seeded data mart has no schema actualized, so every filter column
    // is unknown to BlendableSchemaService — this exercises the structured
    // error path of the validator end-to-end.
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

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('FILTER_COLUMN_UNKNOWN');
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
});
