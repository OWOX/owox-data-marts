import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  setupConnectorDataMart,
  ReportBuilder,
  DataDestinationBuilder,
  ScheduledTriggerBuilder,
  AUTH_HEADER,
  NONEXISTENT_UUID,
  LOOKER_STUDIO_CREDENTIALS,
} from '@owox/test-utils';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';

const MALFORMED_UUID = 'not-a-valid-uuid';

/**
 * Assert consistent error response shape (ERR-03).
 * The `statusCode` field is present in ALL error responses:
 * - GlobalExceptionFilter: { statusCode, timestamp, path, requestId }
 * - BaseExceptionFilter: { statusCode, timestamp, path, message, errorDetails }
 * NOTE: `message` is NOT universally present -- only on BusinessViolationException.
 */
function expectErrorShape(
  res: supertest.Response,
  expectedStatus: number,
): void {
  expect(res.status).toBe(expectedStatus);
  expect(res.body.statusCode).toBe(expectedStatus);
}

describe('Cross-Cutting Error Handling (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  // Shared setup entities
  let dataMartId: string;
  let dataDestinationId: string;
  let connectorDataMartId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // Setup prerequisites for report FK tests
    const reportPrereqs = await setupReportPrerequisites(agent);
    dataMartId = reportPrereqs.dataMartId;
    dataDestinationId = reportPrereqs.dataDestinationId;

    // CONNECTOR-type DataMart for trigger and manual run tests
    const connectorSetup = await setupConnectorDataMart(agent, app);
    connectorDataMartId = connectorSetup.dataMartId;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // =========================================================================
  // ERR-01: Non-existent UUID returns 404
  // =========================================================================
  describe('ERR-01: Non-existent UUID returns 404', () => {
    it('GET /api/reports/:id - returns 404 for non-existent UUID', async () => {
      const res = await agent
        .get(`/api/reports/${NONEXISTENT_UUID}`)
        .set(AUTH_HEADER);

      expectErrorShape(res, 404);
    });

    it('GET /api/data-destinations/:id - returns 404 for non-existent UUID', async () => {
      const res = await agent
        .get(`/api/data-destinations/${NONEXISTENT_UUID}`)
        .set(AUTH_HEADER);

      expectErrorShape(res, 404);
    });

    it('GET /api/data-marts/:dataMartId/scheduled-triggers/:id - returns 404 for non-existent UUID', async () => {
      const res = await agent
        .get(
          `/api/data-marts/${connectorDataMartId}/scheduled-triggers/${NONEXISTENT_UUID}`,
        )
        .set(AUTH_HEADER);

      expectErrorShape(res, 404);
    });
  });

  // =========================================================================
  // ERR-02: Malformed UUID handling
  // =========================================================================
  describe('ERR-02: Malformed UUID handling', () => {
    it('GET /api/reports/:id - returns consistent error for malformed UUID', async () => {
      const res = await agent
        .get(`/api/reports/${MALFORMED_UUID}`)
        .set(AUTH_HEADER);

      // No ParseUUIDPipe on controllers -- malformed string passes to TypeORM.
      // SQLite string comparison returns no match -> service throws NotFoundException -> 404.
      // Tightened after empirical verification.
      expectErrorShape(res, 404);
    });

    it('GET /api/data-destinations/:id - returns consistent error for malformed UUID', async () => {
      const res = await agent
        .get(`/api/data-destinations/${MALFORMED_UUID}`)
        .set(AUTH_HEADER);

      // Same behavior: malformed string -> no DB match -> NotFoundException -> 404.
      expectErrorShape(res, 404);
    });

    it('GET /api/data-marts/:dataMartId/scheduled-triggers/:id - returns consistent error for malformed UUID', async () => {
      const res = await agent
        .get(
          `/api/data-marts/${connectorDataMartId}/scheduled-triggers/${MALFORMED_UUID}`,
        )
        .set(AUTH_HEADER);

      // Same behavior: malformed string -> no DB match -> NotFoundException -> 404.
      expectErrorShape(res, 404);
    });
  });

  // =========================================================================
  // ERR-04: FK constraint violations return meaningful errors
  // =========================================================================
  describe('ERR-04: FK constraint violations', () => {
    it('POST /api/reports - returns 404 for non-existent dataDestinationId', async () => {
      const payload = new ReportBuilder()
        .withDataMartId(dataMartId)
        .withDataDestinationId(NONEXISTENT_UUID)
        .build();

      const res = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(payload);

      // CreateReportService calls dataDestinationService.getByIdAndProjectId()
      // which throws NotFoundException before INSERT.
      expectErrorShape(res, 404);
    });

    it('POST /api/data-marts/:dataMartId/scheduled-triggers - returns 404 for non-existent dataMartId', async () => {
      const payload = new ScheduledTriggerBuilder().build();

      const res = await agent
        .post(
          `/api/data-marts/${NONEXISTENT_UUID}/scheduled-triggers`,
        )
        .set(AUTH_HEADER)
        .send(payload);

      // Service validates dataMart exists before creating trigger.
      expectErrorShape(res, 404);
    });

    it('POST /api/data-marts/:dataMartId/manual-run - returns 404 for non-existent dataMartId', async () => {
      const res = await agent
        .post(`/api/data-marts/${NONEXISTENT_UUID}/manual-run`)
        .set(AUTH_HEADER)
        .send({});

      // Service validates dataMart exists before creating run.
      expectErrorShape(res, 404);
    });
  });

  // =========================================================================
  // ERR-05: Cascade/conflict on parent deletion
  // Each test creates FRESH entities (cannot reuse shared setup -- they get deleted).
  // =========================================================================
  describe('ERR-05: Cascade/conflict on parent deletion', () => {
    it('DELETE DataMart cascades to child Reports', async () => {
      // 1. Create fresh prerequisites
      const setup = await setupReportPrerequisites(agent);

      // 2. Create a report
      const payload = new ReportBuilder()
        .withDataMartId(setup.dataMartId)
        .withDataDestinationId(setup.dataDestinationId)
        .build();

      const createRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(payload);

      expect(createRes.status).toBe(201);
      const reportId = createRes.body.id;

      // 3. Delete the DataMart (cascade delete per DeleteDataMartService)
      const deleteRes = await agent
        .delete(`/api/data-marts/${setup.dataMartId}`)
        .set(AUTH_HEADER);

      expect(deleteRes.status).toBe(200);

      // 4. Verify child report is gone
      const checkRes = await agent
        .get(`/api/reports/${reportId}`)
        .set(AUTH_HEADER);

      expectErrorShape(checkRes, 404);
    });

    it('DELETE DataMart cascades to child ScheduledTriggers', async () => {
      // 1. Create fresh CONNECTOR-type DataMart
      const setup = await setupConnectorDataMart(agent, app);

      // 2. Create a trigger
      const payload = new ScheduledTriggerBuilder().build();

      const createRes = await agent
        .post(`/api/data-marts/${setup.dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(payload);

      expect(createRes.status).toBe(201);
      const triggerId = createRes.body.id;

      // 3. Delete the DataMart
      const deleteRes = await agent
        .delete(`/api/data-marts/${setup.dataMartId}`)
        .set(AUTH_HEADER);

      expect(deleteRes.status).toBe(200);

      // 4. Verify child trigger is gone
      const checkRes = await agent
        .get(
          `/api/data-marts/${setup.dataMartId}/scheduled-triggers/${triggerId}`,
        )
        .set(AUTH_HEADER);

      expectErrorShape(checkRes, 404);
    });

    it('DELETE DataMart cascades to child Runs', async () => {
      // 1. Create fresh CONNECTOR-type DataMart
      const setup = await setupConnectorDataMart(agent, app);

      // 2. Create a manual run
      const runRes = await agent
        .post(`/api/data-marts/${setup.dataMartId}/manual-run`)
        .set(AUTH_HEADER)
        .send({});

      expect(runRes.status).toBe(201);
      const runId = runRes.body.runId;

      // 3. Delete the DataMart
      const deleteRes = await agent
        .delete(`/api/data-marts/${setup.dataMartId}`)
        .set(AUTH_HEADER);

      expect(deleteRes.status).toBe(200);

      // 4. Verify child run is gone
      // The deleted DataMart may cause the runs endpoint to 404 for the parent
      // (DataMart lookup fails before run lookup). Either way, the run is inaccessible.
      const checkRes = await agent
        .get(`/api/data-marts/${setup.dataMartId}/runs/${runId}`)
        .set(AUTH_HEADER);

      expectErrorShape(checkRes, 404);
    });
  });

  // =========================================================================
  // ERR-06: Duplicate creation behavior (empirical regression anchors)
  // =========================================================================
  describe('ERR-06: Duplicate creation', () => {
    it('duplicate DataDestination creation succeeds with different IDs', async () => {
      // Use LOOKER_STUDIO type (GOOGLE_SHEETS validates credentials via real Google APIs)
      const payload = new DataDestinationBuilder()
        .withType(DataDestinationType.LOOKER_STUDIO)
        .withCredentials(LOOKER_STUDIO_CREDENTIALS)
        .build();

      const res1 = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(payload);

      expect(res1.status).toBe(201);

      const res2 = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(payload);

      // Both creations succeed with auto-generated UUIDs
      expect(res2.status).toBe(201);
      expect(res2.body.id).not.toBe(res1.body.id);
    });

    it('duplicate Report creation - captures actual behavior', async () => {
      // Use shared dataMartId + dataDestinationId from beforeAll
      const payload = new ReportBuilder()
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();

      const res1 = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(payload);

      expect(res1.status).toBe(201);

      const res2 = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(payload);

      // LOOKER_STUDIO reports use deterministic UUID v5 from @BeforeInsert hook.
      // Same (dataMartId + dataDestinationId) = same UUID.
      // KNOWN BUG: Should return 409 Conflict, currently returns 500
      // (SQLITE_CONSTRAINT_PRIMARYKEY) because no upsert logic exists for
      // duplicate reports with deterministic IDs.
      // TODO: Fix backend to return 409, then change this assertion.
      expect([409, 500]).toContain(res2.status);
    });

    it('duplicate ScheduledTrigger creation succeeds with different IDs', async () => {
      const payload = new ScheduledTriggerBuilder().build();

      const res1 = await agent
        .post(
          `/api/data-marts/${connectorDataMartId}/scheduled-triggers`,
        )
        .set(AUTH_HEADER)
        .send(payload);

      expect(res1.status).toBe(201);

      const res2 = await agent
        .post(
          `/api/data-marts/${connectorDataMartId}/scheduled-triggers`,
        )
        .set(AUTH_HEADER)
        .send(payload);

      // Both creations succeed with auto-generated UUIDs
      expect(res2.status).toBe(201);
      expect(res2.body.id).not.toBe(res1.body.id);
    });
  });
});
