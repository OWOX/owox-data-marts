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
import { CreateViewService } from 'src/data-marts/use-cases/create-view.service';
import { CreateViewCommand } from 'src/data-marts/dto/domain/create-view.command';

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
// which requires real storage credentials — stubbed below, so the one test that
// composes asserts SQL shape without ever reaching BigQuery.

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

  // A SQL-defined data mart materializes a real BigQuery view on the /generated-sql path
  // (composer → resolveTableName → CreateViewService), which needs live credentials. The one
  // test here that composes asserts SQL SHAPE, not BigQuery execution — same stub the blended
  // full-flow e2e uses.
  const createViewServiceMock = {
    run: jest.fn(async (command: CreateViewCommand) => ({
      fullyQualifiedName: `\`output_controls_test.${command.viewName}\``,
    })),
  };

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: CreateViewService, useValue: createViewServiceMock },
    ]);
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

  // Calculated fields. What http-data.e2e-spec.ts already covers (implicit-all
  // exclusion, explicit selection, AGGREGATION_ON_CALCULATED_FIELD) is not repeated here — this
  // block fills the gaps: the schema-save validation contract itself (§6.2's `{ errors, warnings }`
  // channel, the joined-reference gate) and the composition guards that only a report's own save
  // / read path can exercise. No live warehouse call is needed for any of it: a formula is rejected
  // by OUR parser before a dry run is ever attempted (CalculatedFieldValidatorService only reaches
  // the warehouse once the parser pass is clean), and the tests that compose go through the
  // file-wide CreateViewService stub (see the file-level comment above), so they assert SQL shape
  // rather than BigQuery execution.
  describe('Calculated field — save and composition guards', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    let cmDataMartId: string;
    let cmDataDestinationId: string;
    let cmReportId: string;

    beforeAll(async () => {
      const prereqs = await setupReportPrerequisites(agent);
      cmDataMartId = prereqs.dataMartId;
      cmDataDestinationId = prereqs.dataDestinationId;

      const createRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withDataMartId(cmDataMartId)
            .withDataDestinationId(cmDataDestinationId)
            .build()
        );
      expect(createRes.status).toBe(201);
      cmReportId = createRes.body.id;
    });

    // The next test's save is the first one that actually persists — this one is rejected, so it
    // leaves the data mart's schema untouched.
    it('PUT schema rejects a formula whose joined path names no source with FORMULA_JOINED_PATH_NOT_FOUND', async () => {
      const res = await agent
        .put(`/api/data-marts/${cmDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              {
                name: 'ctr',
                type: 'FLOAT',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                calculated: {
                  formula: 'SUM({{ref path="orders" field="revenue"}})',
                  level: 'metric',
                },
              },
            ],
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.errorDetails.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'FORMULA_JOINED_PATH_NOT_FOUND',
            field: 'ctr',
          }),
        ])
      );
    });

    // Every later test in this block reads the schema THIS save leaves behind.
    it('PUT schema accepts a valid own-Data-Mart formula, stamps it skipped (no storage configured), and returns the warning on the wire', async () => {
      const res = await agent
        .put(`/api/data-marts/${cmDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              {
                name: 'ctr',
                type: 'FLOAT',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                calculated: { formula: CTR_FORMULA, level: 'metric' },
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      // §6.2: the save response carries `{ errors, warnings }` on the wire, not only internally.
      // This test's storage was created via POST /api/data-storages with no config, so the dry run
      // is skipped rather than attempted — that must surface as a warning, not a
      // silent pass.
      expect(res.body.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED', field: 'ctr' }),
        ])
      );
      // Decision 9: the stamp is PERSISTED on the field, not only returned once — a later save
      // must be able to tell it still needs re-checking.
      const ctrField = res.body.schema.fields.find((f: { name: string }) => f.name === 'ctr');
      expect(ctrField.calculated.warehouseValidation).toBe('skipped');
    });

    // Canonicalization is what lets the WEB reader stay a strict, simple pattern instead of
    // reimplementing the Handlebars grammar: `CalculatedFieldValidatorService.validate` rewrites
    // every tag through `serializeFormulaReference` IN PLACE, on the very object the save then
    // persists. Nothing pinned that seam end-to-end — `validate` is mocked in every
    // update-data-mart-schema.service.spec.ts test, so wrapping its argument in `structuredClone`
    // (which the method's own docstring invites: "a caller that must not mutate its input should
    // pass a deep copy") leaves the whole unit suite green while persisting the raw text, after
    // which the strict web reader shows the analyst `{{ref …}}` tags. This save submits the tag
    // spellings a non-web client can legitimately produce — extra whitespace, single quotes, an
    // unknown extra key — and asserts what comes back is the one canonical spelling.
    it('PUT schema persists a non-canonical formula in canonical spelling', async () => {
      const res = await agent
        .put(`/api/data-marts/${cmDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              {
                name: 'ctr',
                type: 'FLOAT',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                calculated: {
                  formula:
                    "SUM({{ref   field='clicks'  }}) / " +
                    'NULLIF(SUM({{ref field="impressions" note="ignored"}}), 0)',
                  level: 'metric',
                },
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      const ctrField = res.body.schema.fields.find((f: { name: string }) => f.name === 'ctr');
      // Byte-for-byte the canonical form, which is also exactly what the previous save left
      // behind — so the tests after this one still read the schema they expect.
      expect(ctrField.calculated.formula).toBe(CTR_FORMULA);
    });

    it('PUT report rejects a date-trunc naming the calculated field with CALCULATED_FIELD_AS_DIMENSION', async () => {
      const res = await agent
        .put(`/api/reports/${cmReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Metric as dimension',
          dataDestinationId: cmDataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['ctr'],
          dateTruncConfig: [{ column: 'ctr', unit: 'DAY' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.details.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'CALCULATED_FIELD_AS_DIMENSION', column: 'ctr' }),
        ])
      );
    });
  });

  // A main-owner calculated field on a report that ALSO spans a joined Data Mart. Forced onto
  // the blended path here via a joined Unique Count, mirroring the `uniqueCountConfig persistence
  // round trip` block above.
  describe('Calculated field — on a blended report', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    let blendMainDataMartId: string;
    let blendDestinationId: string;
    let blendReportId: string;

    beforeAll(async () => {
      const prereqs = await setupBlendedReportPrerequisites(agent);
      blendMainDataMartId = prereqs.mainDataMartId;

      const mainSchemaRes = await agent
        .put(`/api/data-marts/${prereqs.mainDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
              {
                name: 'ctr',
                type: 'FLOAT',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                calculated: { formula: CTR_FORMULA, level: 'metric' },
              },
            ],
          },
        });
      expect(mainSchemaRes.status).toBe(200);

      // A declared primary key is what makes `users` an available Unique Count source at all.
      const usersSchemaRes = await agent
        .put(`/api/data-marts/${prereqs.usersDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'id',
                type: 'STRING',
                mode: 'NULLABLE',
                status: 'CONNECTED',
                isPrimaryKey: true,
              },
            ],
          },
        });
      expect(usersSchemaRes.status).toBe(200);

      // A fresh destination: the prerequisites' own report already owns the
      // (mainDataMartId, dataDestinationId) pair used by its deterministic LOOKER_STUDIO UUID.
      const destRes = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Calculated field on blended')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(destRes.status).toBe(201);
      blendDestinationId = destRes.body.id;
      await agent
        .put(`/api/data-destinations/${blendDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    }, 120_000);

    // The save-time refusal is gone: the blended builder now renders the metric from its stored
    // formula, at the same grain as the joined aggregates beside it.
    it('POST report accepts the metric beside a joined Unique Count', async () => {
      const res = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send({
          title: 'Metric on blended',
          dataMartId: blendMainDataMartId,
          dataDestinationId: blendDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['ctr'],
          uniqueCountConfig: ['users'],
        });

      expect(res.status).toBe(201);
      blendReportId = res.body.id;
    });

    // Composition, not just the save: the whole pipeline (validator → decision → blended builder)
    // has to put the substituted formula in the outer SELECT and the columns it reads in the main
    // CTE, beside the joined Unique Count that forced the blended path in the first place.
    it('GET generated-sql renders the substituted formula beside the joined Unique Count', async () => {
      const res = await agent.get(`/api/reports/${blendReportId}/generated-sql`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const sql = res.body.sql as string;
      expect(sql).toContain('SUM(main.clicks) / NULLIF(SUM(main.impressions), 0) AS `ctr`');
      expect(sql).toContain('users__unique_count');
      const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
      expect(mainCte).not.toBeNull();
      expect(mainCte![1]).toContain('clicks');
      expect(mainCte![1]).toContain('impressions');
      // A metric is already an aggregate, and it is the only projected column here — so the outer
      // query groups by nothing at all. (Every CTE above it has a GROUP BY of its own.)
      const outerQuery = sql.slice(sql.lastIndexOf('\nSELECT\n'));
      expect(outerQuery).toContain('AS `ctr`');
      expect(outerQuery).not.toContain('GROUP BY');
    });

    // Sorting by a metric is supported — `validateSort` only asks that the column be
    // selected. So this saves, and then every
    // run, Looker fetch and HTTP-Data stream has to work: `ctr` is an outer-SELECT alias, and
    // seeding the builder's referenced columns from the sort put it in the main raw CTE's
    // projection, failing at the warehouse with `Unrecognized name: ctr`.
    // The sort orders by the metric's CAST EXPRESSION rather than its bare alias: a sort is a
    // comparison, so the declared type reaches it the same way it reaches a filter, and ordering
    // the alias sorted a FLOAT-declared formula's text — under a LIMIT a different ROW SET, not a
    // different order. The alias cannot simply be wrapped, because Redshift resolves an output
    // name only as a bare ORDER BY term. What this test is really about is unchanged and asserted
    // below: the metric's NAME must stay out of the main raw CTE.
    it('PUT report accepts a sort on the metric, and the SQL orders by its cast expression', async () => {
      const putRes = await agent
        .put(`/api/reports/${blendReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Metric sorted on blended',
          dataDestinationId: blendDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['ctr'],
          uniqueCountConfig: ['users'],
          sortConfig: [{ column: 'ctr', direction: 'desc' }],
        });
      expect(putRes.status).toBe(200);

      const res = await agent.get(`/api/reports/${blendReportId}/generated-sql`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const sql = res.body.sql as string;
      const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
      expect(mainCte).not.toBeNull();
      expect(mainCte![1]).not.toContain('ctr');
      expect(sql).toContain(
        'ORDER BY\n  CAST((SUM(main.clicks) / NULLIF(SUM(main.impressions), 0)) AS FLOAT64) DESC'
      );
      expect(sql).not.toContain('ORDER BY\n  `ctr` DESC');
    });

    // The flat path this Data Mart's reports took before still works: same mart, same metric,
    // nothing reaching a joined source.
    it('PUT report accepts the metric when the report reaches no joined source', async () => {
      const res = await agent
        .put(`/api/reports/${blendReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Metric on the flat path',
          dataDestinationId: blendDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['clicks', 'ctr'],
        });

      expect(res.status).toBe(200);
    });

    // Filtering by a metric ships. The published reason for the old refusal
    // described an ALIAS, and a predicate's left-hand side here is already an opaque SQL string —
    // the LHS is the field's own formula, measured compiling identically on all five storages.
    // Asserted on the BLENDED shape (the joined Unique Count) because that is the path where the
    // plan has furthest to travel: the rule reaches `renderHaving` through the blended builder,
    // and without the plan the builder refuses by name rather than emitting a wrong predicate.
    it('PUT report accepts a filter on the calculated field, and HAVING compares the formula', async () => {
      const putRes = await agent
        .put(`/api/reports/${blendReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Metric filter',
          dataDestinationId: blendDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          columnConfig: ['clicks', 'ctr'],
          uniqueCountConfig: ['users'],
          filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
        });
      expect(putRes.status).toBe(200);

      const res = await agent.get(`/api/reports/${blendReportId}/generated-sql`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const sql = res.body.sql as string;
      // Both sides carry the field's DECLARED type — over the whole HTTP path,
      // so the schema's `FLOAT` reaches the comparison rather than the value's JS type deciding it.
      expect(sql).toContain(
        'HAVING CAST((SUM(main.clicks) / NULLIF(SUM(main.impressions), 0)) AS FLOAT64) > ' +
          'CAST(0.5 AS FLOAT64)'
      );
      // Never the field's own name: `ctr` is an outer SELECT alias, not a column of any CTE.
      expect(sql).not.toContain('HAVING main.ctr');
    });
  });
});
