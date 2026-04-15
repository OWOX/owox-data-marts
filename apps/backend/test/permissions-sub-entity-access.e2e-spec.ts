import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  AUTH_HEADER,
} from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };
const VIEWER_AUTH_HEADER = { 'x-owox-authorization': 'viewer-token' };

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
 * Permissions Model: Sub-entity access control.
 *
 * Verifies that Scheduled Triggers, Insights, InsightArtifacts, InsightTemplates,
 * AI Assistant sessions, trigger controllers, and Destination OAuth endpoints
 * enforce parent DataMart / Destination access checks.
 */
describe('Permissions Model Sub-Entity Access Control (e2e)', () => {
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

    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULED TRIGGERS — parent DM access
  // ═══════════════════════════════════════════════════════════════

  describe('Scheduled Triggers — Not shared DM blocks access', () => {
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

    it('GET /api/data-marts/:id/scheduled-triggers → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/scheduled-triggers → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER)
        .send({ type: 'CONNECTOR_RUN', cronExpression: '0 * * * *', timeZone: 'UTC' });
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/scheduled-triggers → 200 for admin', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  describe('Scheduled Triggers — Shared for reporting: can see but not manage', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts/:id/scheduled-triggers → 200 for non-owner TU (can see)', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('POST /api/data-marts/:id/scheduled-triggers → 403 for non-owner TU (no maintenance)', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER)
        .send({ type: 'CONNECTOR_RUN', cronExpression: '0 * * * *', timeZone: 'UTC' });
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INSIGHTS — parent DM access
  // ═══════════════════════════════════════════════════════════════

  describe('Insights — Not shared DM blocks access', () => {
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

    it('GET /api/data-marts/:id/insights → 403 for non-owner TU', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/insights`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/insights → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/insights`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/insights → 200 for admin', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/insights`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INSIGHT ARTIFACTS — parent DM access
  // ═══════════════════════════════════════════════════════════════

  describe('Insight Artifacts — Not shared DM blocks access', () => {
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

    it('GET /api/data-marts/:id/insight-artifacts → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-artifacts`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/insight-artifacts → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/insight-artifacts`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail', sql: 'SELECT 1' });
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/insight-artifacts → 200 for admin', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-artifacts`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INSIGHT TEMPLATES — parent DM access
  // ═══════════════════════════════════════════════════════════════

  describe('Insight Templates — Not shared DM blocks access', () => {
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

    it('GET /api/data-marts/:id/insight-templates → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-templates`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/insight-templates → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/insight-templates`)
        .set(EDITOR_AUTH_HEADER)
        .send({ title: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/insight-templates → 200 for admin', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-templates`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI ASSISTANT — parent DM access
  // ═══════════════════════════════════════════════════════════════

  describe('AI Assistant — Not shared DM blocks access', () => {
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

    it('GET /api/data-marts/:id/ai-assistant/sessions → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/ai-assistant/sessions?scope=template`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/ai-assistant/sessions → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/ai-assistant/sessions`)
        .set(EDITOR_AUTH_HEADER)
        .send({ scope: 'template', templateId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(403);
    });

    it('GET /api/data-marts/:id/ai-assistant/sessions → 200 for admin', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/ai-assistant/sessions?scope=template`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TRIGGER CONTROLLERS — schema-actualize, sql-dry-run
  // ═══════════════════════════════════════════════════════════════

  describe('Trigger controllers — Not shared DM blocks trigger creation', () => {
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

    it('POST /api/data-marts/:id/schema-actualize-triggers → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/schema-actualize-triggers`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/sql-dry-run-triggers → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/sql-dry-run-triggers`)
        .set(EDITOR_AUTH_HEADER)
        .send({ sql: 'SELECT 1' });
      expect(res.status).toBe(403);
    });

    it('POST /api/data-marts/:id/schema-actualize-triggers → success for admin', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/schema-actualize-triggers`)
        .set(AUTH_HEADER);
      expect([200, 201]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DESTINATION OAUTH — ownership check
  // ═══════════════════════════════════════════════════════════════

  describe('Destination OAuth — Not shared blocks OAuth operations', () => {
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

    it('GET /api/data-destinations/:id/oauth/status → 403 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-destinations/${dataDestinationId}/oauth/status`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });

    it('POST /api/data-destinations/:id/oauth/authorize → 403 for non-owner TU', async () => {
      const res = await agent
        .post(`/api/data-destinations/${dataDestinationId}/oauth/authorize`)
        .set(EDITOR_AUTH_HEADER)
        .send({ redirectUri: 'http://localhost' });
      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-destinations/:id/oauth → 403 for non-owner TU', async () => {
      const res = await agent
        .delete(`/api/data-destinations/${dataDestinationId}/oauth`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POSITIVE: Shared for maintenance — TU can access sub-entities
  // ═══════════════════════════════════════════════════════════════

  describe('Shared for maintenance — non-owner TU can access sub-entities', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts/:id/scheduled-triggers → 200 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id/insights → 200 for non-owner TU', async () => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/insights`).set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id/insight-artifacts → 200 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-artifacts`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id/insight-templates → 200 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/insight-templates`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('GET /api/data-marts/:id/ai-assistant/sessions → 200 for non-owner TU', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/ai-assistant/sessions?scope=template`)
        .set(EDITOR_AUTH_HEADER);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POSITIVE: Shared for reporting — BU can see triggers list
  // ═══════════════════════════════════════════════════════════════

  describe('Shared for reporting — BU can see but not manage triggers', () => {
    beforeAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
    });

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    it('GET /api/data-marts/:id/scheduled-triggers → 200 for BU (can see)', async () => {
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER);
      expect(res.status).toBe(200);
    });

    it('POST /api/data-marts/:id/scheduled-triggers → 403 for BU (cannot manage)', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send({ type: 'CONNECTOR_RUN', cronExpression: '0 * * * *', timeZone: 'UTC' });
      expect(res.status).toBe(403);
    });
  });
});
