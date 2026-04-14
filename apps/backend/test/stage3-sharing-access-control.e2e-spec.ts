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
 * Stage 3: Sharing & Owner-based Access Control E2E Tests
 */
describe('Stage 3 Sharing Access Control (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;
  let dataMartId: string;
  let dataDestinationId: string;

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

    // Setup prerequisites (helper auto-shares, we un-share for Stage 3 tests)
    const prereqs = await setupReportPrerequisites(agent);
    storageId = prereqs.storageId;
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;

    // Un-share everything so "Not Shared" tests work
    await agent
      .put(`/api/data-storages/${storageId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: false, availableForMaintenance: false });
    await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: false, availableForMaintenance: false });
    await agent
      .put(`/api/data-destinations/${dataDestinationId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: false, availableForMaintenance: false });
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ─── Not Shared: non-owners cannot see entities ──────────────

  describe('Not Shared — entities invisible to non-owners', () => {
    it('GET /api/data-marts → non-owner TU sees empty list', async () => {
      const res = await agent.get('/api/data-marts').set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('GET /api/data-storages → non-owner TU sees empty list', async () => {
      const res = await agent.get('/api/data-storages').set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /api/data-destinations → non-owner BU sees empty list', async () => {
      const res = await agent.get('/api/data-destinations').set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /api/reports → non-owner BU sees empty list (DM invisible)', async () => {
      const res = await agent.get('/api/reports').set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // ─── Sharing configuration endpoints ─────────────────────────

  describe('Sharing configuration — governance', () => {
    it('PUT /api/data-marts/:id/sharing → 403 for non-owner editor', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(EDITOR_AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-marts/:id/sharing → 204 for admin', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      expect(res.status).toBe(204);
    });
  });

  // ─── Shared for reporting: visibility but no mutation ────────

  describe('Shared for reporting — visibility only', () => {
    it('GET /api/data-marts → non-owner TU now sees the DM', async () => {
      const res = await agent.get('/api/data-marts').set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/data-marts → non-owner BU also sees shared DM', async () => {
      const res = await agent.get('/api/data-marts').set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('PUT /api/data-marts/:id/owners → 403 for non-owner editor (no maintenance)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(EDITOR_AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['1'] });
      expect(res.status).toBe(403);
    });
  });

  // ─── Enable maintenance sharing ──────────────────────────────

  describe('Shared for maintenance — full access for TU', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('non-owner TU can create report on shared DM', async () => {
      const payload = new ReportBuilder()
        .withTitle('TU Report on Shared DM')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();

      const res = await agent.post('/api/reports').set(EDITOR_AUTH_HEADER).send(payload);
      expect(res.status).toBe(201);

      // Cleanup
      await agent.delete(`/api/reports/${res.body.id}`).set(EDITOR_AUTH_HEADER);
    });

    it('non-owner BU cannot edit DM (maintenance = TU only for DM)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(VIEWER_AUTH_HEADER)
        .send({ title: 'BU Should Fail' });
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin always has full access ────────────────────────────

  describe('Admin — full access regardless of sharing', () => {
    it('admin sees all entities even when not shared', async () => {
      // Reset to not shared
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent.get('/api/data-marts').set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);

      // Restore for subsequent tests
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });
  });

  // ─── Availability in main PUT (inline, not separate endpoint) ─

  describe('Availability fields in main PUT endpoint', () => {
    beforeAll(async () => {
      // Restore sharing so entities are accessible
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('PUT /api/data-destinations/:id accepts availability fields and persists them', async () => {
      // Get current destination to preserve required fields
      const getCurrent = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);
      expect(getCurrent.status).toBe(200);

      // Update with availability fields in the main PUT body
      const updateRes = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER)
        .send({
          title: getCurrent.body.title,
          availableForUse: false,
          availableForMaintenance: false,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.availableForUse).toBe(false);
      expect(updateRes.body.availableForMaintenance).toBe(false);

      // Verify persistence via GET
      const getAfter = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);
      expect(getAfter.body.availableForUse).toBe(false);
      expect(getAfter.body.availableForMaintenance).toBe(false);
    });

    it('PUT /api/data-destinations/:id without availability fields does not reset them', async () => {
      // First set specific values
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: true });

      const getCurrent = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);

      // Update without availability fields
      const updateRes = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER)
        .send({ title: getCurrent.body.title });
      expect(updateRes.status).toBe(200);

      // Values should remain unchanged
      const getAfter = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);
      expect(getAfter.body.availableForUse).toBe(false);
      expect(getAfter.body.availableForMaintenance).toBe(true);
    });

    it('PUT /api/data-destinations/:id with availability → 403 for non-owner', async () => {
      // Restore sharing so editor can see the destination
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });

      const getCurrent = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);

      const res = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: getCurrent.body.title,
          availableForUse: false,
          availableForMaintenance: false,
        });
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-destinations/:id with availability + ownerIds in single request', async () => {
      const getCurrent = await agent
        .get(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER);

      const updateRes = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(AUTH_HEADER)
        .send({
          title: getCurrent.body.title,
          ownerIds: [ADMIN_PAYLOAD.userId],
          availableForUse: true,
          availableForMaintenance: false,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.availableForUse).toBe(true);
      expect(updateRes.body.availableForMaintenance).toBe(false);
      expect(updateRes.body.ownerUsers.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Member ownership warnings ───────────────────────────────

  describe('Member ownership warnings', () => {
    it('GET /api/data-marts/member-ownership-warnings → 200 for admin', async () => {
      const res = await agent.get('/api/data-marts/member-ownership-warnings').set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
