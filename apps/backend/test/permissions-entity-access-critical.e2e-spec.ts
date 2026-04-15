import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

const VIEWER_AUTH_HEADER = { 'x-owox-authorization': 'viewer-token' };
const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };

const ADMIN_PAYLOAD: Payload = {
  userId: '0',
  email: 'admin@localhost',
  roles: ['admin'],
  fullName: 'Admin',
  projectId: '0',
};
const EDITOR_PAYLOAD: Payload = {
  userId: '1',
  email: 'editor@localhost',
  roles: ['editor'],
  fullName: 'Technical User',
  projectId: '0',
};
const VIEWER_PAYLOAD: Payload = {
  userId: '2',
  email: 'viewer@localhost',
  roles: ['viewer'],
  fullName: 'Business User',
  projectId: '0',
};

function resolvePayload(token: string): Payload {
  if (token.startsWith('viewer')) return VIEWER_PAYLOAD;
  if (token.startsWith('editor')) return EDITOR_PAYLOAD;
  return ADMIN_PAYLOAD;
}

/**
 * Permissions Model: Entity-level access control for Storage, Destination, Report, and DataMart sub-operations.
 *
 * Verifies that AccessDecisionService blocks direct URL access to Not shared entities.
 */
describe('Permissions Model Entity Access — Storage, Destination, Report, DM sub-ops (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;
  let dataMartId: string;
  let dataDestinationId: string;
  let reportId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest
      .spyOn(idpProvider, 'introspectToken')
      .mockImplementation(async token => resolvePayload(token));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async token => resolvePayload(token));

    const facade = app.get(IdpProjectionsFacade);
    jest
      .spyOn(facade, 'getProjectMembers')
      .mockResolvedValue([
        new ProjectMemberDto('0', 'admin@localhost', 'Admin', undefined, 'admin', true, false),
        new ProjectMemberDto(
          '1',
          'editor@localhost',
          'Technical User',
          undefined,
          'editor',
          true,
          false
        ),
        new ProjectMemberDto(
          '2',
          'viewer@localhost',
          'Business User',
          undefined,
          'viewer',
          true,
          false
        ),
      ]);

    // Create all prerequisites as admin (owner = userId '0')
    const prereqs = await setupReportPrerequisites(agent);
    storageId = prereqs.storageId;
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;

    // Create a report for Report GET tests
    const reportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withTitle('Test Report')
          .withDataMartId(dataMartId)
          .withDataDestinationId(dataDestinationId)
          .build()
      );
    expect(reportRes.status).toBe(201);
    reportId = reportRes.body.id;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ═══════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════

  describe('Storage — Not shared entity-level access', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-storages/${storageId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-storages/${storageId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('GET /api/data-storages/:id → 403 for non-owner TU', async () => {
      const res = await agent.get(`/api/data-storages/${storageId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-storages/:id → 403 for non-owner TU', async () => {
      const res = await agent.delete(`/api/data-storages/${storageId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-storages/:id → 200 for admin', async () => {
      const res = await agent.get(`/api/data-storages/${storageId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DESTINATION
  // ═══════════════════════════════════════════════════════════════

  describe('Destination — Not shared entity-level access', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('GET /api/data-destinations/:id → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-destinations/:id → 403 for non-owner BU', async () => {
      const res = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-destinations/:id → 403 for non-owner TU', async () => {
      const res = await agent
        .delete(`/api/data-destinations/${dataDestinationId}`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-destinations/:id/rotate-secret-key → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-destinations/${dataDestinationId}/rotate-secret-key`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-destinations/:id → 200 for admin', async () => {
      const res = await agent.get(`/api/data-destinations/${dataDestinationId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REPORT — parent DM visibility
  // ═══════════════════════════════════════════════════════════════

  describe('Report — parent DM not shared blocks GET by ID', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/reports/:id → 403 for non-owner TU (parent DM not shared)', async () => {
      const res = await agent.get(`/api/reports/${reportId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/reports/:id → 403 for non-owner BU (parent DM not shared)', async () => {
      const res = await agent.get(`/api/reports/${reportId}`).set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/reports/:id → 200 for admin', async () => {
      const res = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DATAMART SUB-OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  describe('DataMart sub-operations — Not shared blocks access', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('POST /api/data-marts/:id/validate-definition → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/validate-definition`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/runs → 403 for non-owner TU', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/validate-definition → success for admin', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/validate-definition`)
        .set(AUTH_HEADER);
      expect([200, 201]).toContain(res.status);
    });

    it('GET /api/data-marts/:id/runs → 200 for admin', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SHARED FOR USE/REPORTING — positive tests
  // ═══════════════════════════════════════════════════════════════

  describe('Shared entities — non-owner can see', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-storages/${storageId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
    });

    it('GET /api/data-storages/:id → 200 for non-owner TU (shared for use)', async () => {
      const res = await agent.get(`/api/data-storages/${storageId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-destinations/:id → 200 for non-owner BU (shared for use)', async () => {
      const res = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/reports/:id → 200 for non-owner TU (parent DM shared for reporting)', async () => {
      const res = await agent.get(`/api/reports/${reportId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id/runs → 200 for non-owner TU (DM shared for reporting)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('DELETE /api/data-storages/:id → 403 for non-owner TU (shared for use, not maintenance)', async () => {
      const res = await agent.delete(`/api/data-storages/${storageId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-destinations/:id → 403 for non-owner TU (shared for use, not maintenance)', async () => {
      const res = await agent
        .delete(`/api/data-destinations/${dataDestinationId}`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-storages/:id/validate-access → 403 for non-owner TU (shared for use, not maintenance)', async () => {
      const res = await agent
        .post(`/api/data-storages/${storageId}/validate-access`)
        .set(EDITOR_AUTH_HEADER);
      // Shared for use allows USE → validation should pass access check
      expect(res.status).not.toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VALIDATE STORAGE ACCESS — Not shared blocks validation
  // ═══════════════════════════════════════════════════════════════

  describe('ValidateStorageAccess — Not shared blocks validation', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-storages/${storageId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-storages/${storageId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('POST /api/data-storages/:id/validate-access → 403 for non-owner TU (not shared)', async () => {
      const res = await agent
        .post(`/api/data-storages/${storageId}/validate-access`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-storages/:id/validate-access → success for admin', async () => {
      const res = await agent
        .post(`/api/data-storages/${storageId}/validate-access`)
        .set(AUTH_HEADER);
      expect(res.status).not.toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DESTINATION EDIT — explicit access check
  // ═══════════════════════════════════════════════════════════════

  describe('Destination EDIT — Not shared blocks update', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('PUT /api/data-destinations/:id → 403 for non-owner TU (not shared)', async () => {
      const res = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-destinations/:id → 200 for admin', async () => {
      const res = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER)
        .send({ title: 'Admin Can Edit' });
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DESTINATION COPY CREDENTIALS — requires COPY_CREDENTIALS access
  // ═══════════════════════════════════════════════════════════════

  describe('Destination copy credentials — requires access to source', () => {
    let ownedDestinationId: string;

    beforeAll(async () => {
      // Create a destination owned by editor (TU)
      const destRes = await agent
        .post('/api/data-destinations')
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'Editor Owned Dest',
          type: 'LOOKER_STUDIO',
          credentials: { type: 'looker-studio-credentials' },
        });
      expect(destRes.status).toBe(201);
      ownedDestinationId = destRes.body.id;

      // Make the admin destination Not shared
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
      // Cleanup
      await agent.delete(`/api/data-destinations/${ownedDestinationId}`).set(EDITOR_AUTH_HEADER);
    });

    it('PUT /api/data-destinations/:id with sourceDestinationId → 403 (source not shared)', async () => {
      const res = await agent
        .put(`/api/data-destinations/${ownedDestinationId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'Copy Should Fail',
          sourceDestinationId: dataDestinationId,
        });
      expect(res.status).toBe(403);
    });
  });
});
