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
 * Permissions Model: DataMart entity-level access control E2E tests.
 *
 * Verifies that AccessDecisionService is enforced on single-entity endpoints
 * (GET by ID, PUT title/description/definition/schema, DELETE, publish).
 * List filtering is already tested in permissions-sharing-access-control.e2e-spec.ts.
 */
describe('Permissions Model DataMart Entity-Level Access Control (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
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

    // Create published DM as admin (admin = userId '0' = owner)
    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ─── Not Shared: direct URL access blocked ──────────────────

  describe('Not Shared — entity-level access blocked for non-owners', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
    });

    it('GET /api/data-marts/:id → 403 for non-owner TU (direct URL)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id → 403 for non-owner BU (direct URL)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-marts/:id/title → 403 for non-owner TU', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-marts/:id/description → 403 for non-owner TU', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/description`)
        .set(EDITOR_AUTH_HEADER)
        .send({ description: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-marts/:id → 403 for non-owner TU', async () => {
      const res = await agent.delete(`/api/data-marts/${dataMartId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/reports → 403 for non-owner TU (DM not available for reporting)', async () => {
      const payload = new ReportBuilder()
        .withTitle('Should Not Create')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();
      const res = await agent.post('/api/reports').set(EDITOR_AUTH_HEADER).send(payload);
      expect(res.status).toBe(403);
    });

    it('POST /api/reports → 403 for non-owner BU (DM not available for reporting)', async () => {
      const payload = new ReportBuilder()
        .withTitle('Should Not Create')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();
      const res = await agent.post('/api/reports').set(VIEWER_AUTH_HEADER).send(payload);
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id → 200 for admin (always full access)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dataMartId);
    });

    it('PUT /api/data-marts/:id/title → 200 for admin', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(AUTH_HEADER)
        .send({ title: 'Admin Can Edit' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Admin Can Edit');
    });
  });

  // ─── Shared for reporting: visibility but no edit ───────────

  describe('Shared for reporting — non-owner TU can see but not edit', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
    });

    it('GET /api/data-marts/:id → 200 for non-owner TU (can see)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id → 200 for non-owner BU (can see)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('PUT /api/data-marts/:id/title → 403 for non-owner TU (no maintenance)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('PUT /api/data-marts/:id/description → 403 for non-owner TU (no maintenance)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/description`)
        .set(EDITOR_AUTH_HEADER)
        .send({ description: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-marts/:id → 403 for non-owner TU (no maintenance)', async () => {
      const res = await agent.delete(`/api/data-marts/${dataMartId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/reports → 201 for non-owner BU (DM shared for reporting)', async () => {
      const payload = new ReportBuilder()
        .withTitle('BU Report on Shared DM')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();
      const res = await agent.post('/api/reports').set(VIEWER_AUTH_HEADER).send(payload);
      expect(res.status).toBe(201);

      // Cleanup
      await agent.delete(`/api/reports/${res.body.id}`).set(AUTH_HEADER);
    });
  });

  // ─── Shared for maintenance: TU can edit ────────────────────

  describe('Shared for maintenance — non-owner TU can edit', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts/:id → 200 for non-owner TU', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('PUT /api/data-marts/:id/title → 200 for non-owner TU (maintenance allowed)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'TU Can Edit Now' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('TU Can Edit Now');
    });

    it('PUT /api/data-marts/:id/description → 200 for non-owner TU', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/description`)
        .set(EDITOR_AUTH_HEADER)
        .send({ description: 'TU description' });
      expect(res.status).toBe(200);
    });

    it('PUT /api/data-marts/:id/title → 403 for non-owner BU (maintenance = TU only for DM)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(VIEWER_AUTH_HEADER)
        .send({ title: 'BU Should Fail' });
      expect(res.status).toBe(403);
    });
  });

  // ─── Owner always has access regardless of sharing ──────────

  describe('Owner (admin = creator) — access regardless of sharing state', () => {
    beforeAll(async () => {
      // Set to Not shared
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
    });

    afterAll(async () => {
      // Restore sharing for any subsequent tests
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts/:id → 200 for owner even when Not shared', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('PUT /api/data-marts/:id/title → 200 for owner even when Not shared', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(AUTH_HEADER)
        .send({ title: 'Owner Can Always Edit' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Owner Can Always Edit');
    });

    it('PUT /api/data-marts/:id/description → 200 for owner even when Not shared', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/description`)
        .set(AUTH_HEADER)
        .send({ description: 'Owner description' });
      expect(res.status).toBe(200);
    });
  });

  // ─── Tech Owner with BU role — no effective access ──────────

  describe('Technical Owner with Business User role — no effective DM access', () => {
    beforeAll(async () => {
      // Set DM to Not shared
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      // Assign BU (userId '2') as Technical Owner
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ technicalOwnerIds: ['0', '2'], businessOwnerIds: [] });
    });

    afterAll(async () => {
      // Remove BU from tech owners, restore sharing
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ technicalOwnerIds: ['0'], businessOwnerIds: [] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts (list) → BU with Tech Owner CAN see DM (SEE allowed)', async () => {
      const res = await agent.get('/api/data-marts').set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(dataMartId);
    });

    it('GET /api/data-marts/:id → 200 for BU with Tech Owner (SEE allowed)', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}`).set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('PUT /api/data-marts/:id/title → 403 for BU with Tech Owner (no maintenance)', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(VIEWER_AUTH_HEADER)
        .send({ title: 'BU Tech Owner Should Fail' });
      expect(res.status).toBe(403);
    });
  });
});
