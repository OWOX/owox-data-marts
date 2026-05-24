import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { StorageBuilder } from '../fixtures/storage.builder';
import { DataMartBuilder } from '../fixtures/data-mart.builder';
import { DataDestinationBuilder } from '../fixtures/data-destination.builder';
import { ReportBuilder } from '../fixtures/report.builder';
import { DataDestinationType } from '../../../../apps/backend/src/data-marts/data-destination-types/enums/data-destination-type.enum';

/**
 * IDs returned by {@link setupBlendedReportPrerequisites}.
 */
export interface BlendedReportPrerequisites {
  /** The shared BigQuery storage that all three data marts use. */
  storageId: string;
  /** The "home" (source) data mart — `events`. Reports are created against this DM. */
  mainDataMartId: string;
  /** The first joined data mart — `users`. */
  usersDataMartId: string;
  /** The second joined data mart — `orgs`. */
  orgsDataMartId: string;
  /** Relationship: events → users (JOIN ON events.user_id = users.id). */
  usersRelationshipId: string;
  /** Relationship: events → orgs (JOIN ON events.org_id = orgs.id). */
  orgsRelationshipId: string;
  /** The LOOKER_STUDIO data destination shared by the report. */
  dataDestinationId: string;
  /** The pre-created report pointing at the events data mart. */
  reportId: string;
}

// ── Schema definitions ──────────────────────────────────────────────────────

/**
 * BigQuery schema for the `events` (home) data mart.
 * Used when {@link SetupBlendedReportOptions.withSchemas} is true.
 */
export const EVENTS_SCHEMA = {
  type: 'bigquery-data-mart-schema',
  fields: [
    { name: 'event_id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'user_id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'org_id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'event_ts', type: 'TIMESTAMP', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'amount', type: 'NUMERIC', mode: 'NULLABLE', status: 'CONNECTED' },
  ],
};

/**
 * BigQuery schema for the `users` joined data mart.
 * Used when {@link SetupBlendedReportOptions.withSchemas} is true.
 */
export const USERS_SCHEMA = {
  type: 'bigquery-data-mart-schema',
  fields: [
    { name: 'id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'role', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'is_active', type: 'BOOLEAN', mode: 'NULLABLE', status: 'CONNECTED' },
  ],
};

/**
 * BigQuery schema for the `orgs` joined data mart.
 * Used when {@link SetupBlendedReportOptions.withSchemas} is true.
 */
export const ORGS_SCHEMA = {
  type: 'bigquery-data-mart-schema',
  fields: [
    { name: 'id', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'plan', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
    { name: 'employee_count', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
  ],
};

// ── Options ─────────────────────────────────────────────────────────────────

export interface SetupBlendedReportOptions {
  /**
   * When true, sets real BigQuery schemas on all three data marts via
   * `PUT /api/data-marts/:id/schema`.  This unlocks native-column validation
   * paths (FILTER_COLUMN_UNKNOWN, SORT_COLUMN_NOT_SELECTED on native columns)
   * and allows BlendableSchemaService to run without any mock.
   *
   * Default: false — preserves the original bootstrap behaviour (empty schema,
   * fast, does not break suites that mock the schema service themselves).
   */
  withSchemas?: boolean;
}

// ── Helper: set schema via real API ─────────────────────────────────────────

async function setSchema(
  agent: supertest.Agent,
  dataMartId: string,
  schema: Record<string, unknown>
): Promise<void> {
  const res = await agent
    .put(`/api/data-marts/${dataMartId}/schema`)
    .set(AUTH_HEADER)
    .send({ schema });
  expect(res.status).toBe(200);
}

/**
 * Bootstraps a fully-wired blended report through the REST API only.
 *
 * Setup flow:
 *   1. Create ONE BigQuery storage.
 *   2. Flip storage availability.
 *   3. Create three data marts (events / users / orgs) linked to the same storage.
 *   4. Set SQL definition (`SELECT 1`) and publish each data mart.
 *   5. Flip availability for each data mart.
 *   6. (Optional, `opts.withSchemas`) Set real BigQuery schemas on all three
 *      data marts via `PUT /api/data-marts/:id/schema`.  When set, the real
 *      BlendableSchemaService can compute native + blended fields without a mock.
 *   7. Create two relationships on the events mart:
 *        events → users  (targetAlias = "users",  joinCondition: user_id = id)
 *        events → orgs   (targetAlias = "orgs",   joinCondition: org_id  = id)
 *   8. Configure blendedFieldsConfig on the events mart so users/orgs sources
 *      are included (minimal — no per-field overrides).
 *   9. Create a LOOKER_STUDIO data destination and flip its availability.
 *  10. Create a report (LOOKER_STUDIO) pointing at the events data mart.
 *
 * KNOWN LIMITATION — schema actualisation (without `withSchemas`):
 *   The data marts are published with `SELECT 1`, so their output schema is
 *   empty / un-actualised. Validator paths that call the schema-actualization
 *   service (e.g. FILTER_COLUMN_UNKNOWN, SLICE_COLUMN_UNKNOWN) will fail unless
 *   the test POSTs to `/api/data-marts/:id/schema-actualize-triggers` and
 *   waits for completion, or passes `opts.withSchemas: true`.
 *
 * KNOWN LIMITATION — LOOKER_STUDIO report UUID determinism:
 *   LOOKER_STUDIO destinations derive a deterministic UUID v5 from
 *   (dataMartId, dataDestinationId), so only ONE report can exist per pair.
 *   A test suite that calls this helper once in `beforeAll` and reuses the
 *   returned `reportId` across `it` blocks is the intended usage pattern.
 *
 * @param agent  A supertest agent bound to a running test NestJS app.
 * @param opts   Optional configuration.  Pass `{ withSchemas: true }` to seed
 *               BigQuery schemas on all three data marts so native-column filter
 *               and sort validation paths are exercisable without mocking
 *               BlendableSchemaService.
 * @returns      IDs for all created resources.
 */
export async function setupBlendedReportPrerequisites(
  agent: supertest.Agent,
  opts: SetupBlendedReportOptions = {}
): Promise<BlendedReportPrerequisites> {
  // ── Step 1: Create ONE shared BigQuery storage ─────────────────────────────
  const storageRes = await agent
    .post('/api/data-storages')
    .set(AUTH_HEADER)
    .send(new StorageBuilder().build());
  expect(storageRes.status).toBe(201);
  const storageId: string = storageRes.body.id;

  // ── Step 2: Flip storage availability ─────────────────────────────────────
  await agent
    .put(`/api/data-storages/${storageId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });

  // ── Helper: create + publish a data mart on the shared storage ─────────────
  async function createPublishedDataMart(title: string): Promise<string> {
    const dmRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageId).withTitle(title).build());
    expect(dmRes.status).toBe(201);
    const dataMartId: string = dmRes.body.id;

    const defRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType: 'SQL', definition: { sqlQuery: 'SELECT 1' } });
    expect(defRes.status).toBe(200);

    const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
    expect(publishRes.status).toBe(200);

    await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: true });

    return dataMartId;
  }

  // ── Step 3: Create the three data marts ───────────────────────────────────
  const mainDataMartId = await createPublishedDataMart('Blended Test - events (home)');
  const usersDataMartId = await createPublishedDataMart('Blended Test - users');
  const orgsDataMartId = await createPublishedDataMart('Blended Test - orgs');

  // ── Step 3b (opt-in): Seed real BigQuery schemas ──────────────────────────
  //   When withSchemas is true, set typed field schemas via the real API so
  //   BlendableSchemaService.computeBlendableSchema returns native + blended
  //   fields without any mock.  This unlocks native-column validation paths.
  if (opts.withSchemas) {
    await setSchema(agent, mainDataMartId, EVENTS_SCHEMA);
    await setSchema(agent, usersDataMartId, USERS_SCHEMA);
    await setSchema(agent, orgsDataMartId, ORGS_SCHEMA);
  }

  // ── Step 4: Create relationships on the home data mart ────────────────────
  //   events → users
  const relUsersRes = await agent
    .post(`/api/data-marts/${mainDataMartId}/relationships`)
    .set(AUTH_HEADER)
    .send({
      targetDataMartId: usersDataMartId,
      targetAlias: 'users',
      joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'id' }],
    });
  expect(relUsersRes.status).toBe(201);
  const usersRelationshipId: string = relUsersRes.body.id;

  //   events → orgs
  const relOrgsRes = await agent
    .post(`/api/data-marts/${mainDataMartId}/relationships`)
    .set(AUTH_HEADER)
    .send({
      targetDataMartId: orgsDataMartId,
      targetAlias: 'orgs',
      joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'id' }],
    });
  expect(relOrgsRes.status).toBe(201);
  const orgsRelationshipId: string = relOrgsRes.body.id;

  // ── Step 5: Configure blendedFieldsConfig on the home data mart ───────────
  //   Registers both joined sources so blended columns are selectable.
  const blendedConfigRes = await agent
    .put(`/api/data-marts/${mainDataMartId}/blended-fields-config`)
    .set(AUTH_HEADER)
    .send({
      blendedFieldsConfig: {
        sources: [
          { path: 'users', alias: 'Users' },
          { path: 'orgs', alias: 'Organisations' },
        ],
      },
    });
  expect(blendedConfigRes.status).toBe(200);

  // ── Step 6: Create a LOOKER_STUDIO data destination ──────────────────────
  const destRes = await agent
    .post('/api/data-destinations')
    .set(AUTH_HEADER)
    .send(
      new DataDestinationBuilder()
        .withType(DataDestinationType.LOOKER_STUDIO)
        .withCredentials({ type: 'looker-studio-credentials' })
        .build()
    );
  expect(destRes.status).toBe(201);
  const dataDestinationId: string = destRes.body.id;

  await agent
    .put(`/api/data-destinations/${dataDestinationId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });

  // ── Step 7: Create the report ─────────────────────────────────────────────
  const reportRes = await agent
    .post('/api/reports')
    .set(AUTH_HEADER)
    .send(
      new ReportBuilder()
        .withDataMartId(mainDataMartId)
        .withDataDestinationId(dataDestinationId)
        .build()
    );
  expect(reportRes.status).toBe(201);
  const reportId: string = reportRes.body.id;

  return {
    storageId,
    mainDataMartId,
    usersDataMartId,
    orgsDataMartId,
    usersRelationshipId,
    orgsRelationshipId,
    dataDestinationId,
    reportId,
  };
}
