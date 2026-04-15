import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  DataDestinationBuilder,
  StorageBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

// ─── Role-based auth headers ──────────────────────────────────
// NullIdpProvider returns admin for any token. We override parseToken/introspectToken
// to resolve different roles based on token prefix.
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
 * Permissions Model: Extend Role Definitions — Access Control E2E Tests
 */
describe('Permissions Model Access Control (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let dataDestinationId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // Override NullIdpProvider to support multi-role tokens
    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest
      .spyOn(idpProvider, 'introspectToken')
      .mockImplementation(async token => resolvePayload(token));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async token => resolvePayload(token));

    // Mock getProjectMembers to include all 3 roles
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

    // Setup prerequisites as admin: storage → data mart → publish → destination
    // setupReportPrerequisites auto-shares all entities for test compatibility
    const prereqs = await setupReportPrerequisites(agent);
    dataMartId = prereqs.dataMartId;
    dataDestinationId = prereqs.dataDestinationId;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ─── Business User CANNOT create/edit/delete DataMarts ──────

  describe('Business User — DataMart access denied', () => {
    it('POST /api/data-marts → 403', async () => {
      const res = await agent
        .post('/api/data-marts')
        .set(VIEWER_AUTH_HEADER)
        .send({ title: 'Forbidden DM', storageId: 'any' });

      expect(res.status).toBe(403);
    });

    it('PUT /api/data-marts/:id/title → 403', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/title`)
        .set(VIEWER_AUTH_HEADER)
        .send({ title: 'New Title' });

      expect(res.status).toBe(403);
    });

    it('DELETE /api/data-marts/:id → 403', async () => {
      const res = await agent.delete(`/api/data-marts/${dataMartId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
    });
  });

  // ─── Business User CANNOT create/edit/delete Storages ───────

  describe('Business User — Storage access denied', () => {
    it('POST /api/data-storages → 403', async () => {
      const payload = new StorageBuilder().withType('GOOGLE_BIGQUERY' as DataStorageType).build();
      const res = await agent.post('/api/data-storages').set(VIEWER_AUTH_HEADER).send(payload);

      expect(res.status).toBe(403);
    });
  });

  // ─── Business User CAN manage Destinations (project-wide) ──

  describe('Business User — Destination access allowed (project-wide)', () => {
    let viewerDestinationId: string;

    it('POST /api/data-destinations → 201', async () => {
      const payload = new DataDestinationBuilder()
        .withTitle('Viewer Destination')
        .withType(DataDestinationType.LOOKER_STUDIO)
        .withCredentials({ type: 'looker-studio-credentials' })
        .build();

      const res = await agent.post('/api/data-destinations').set(VIEWER_AUTH_HEADER).send(payload);

      expect(res.status).toBe(201);
      viewerDestinationId = res.body.id;
    });

    it('PUT /api/data-destinations/:id → 200 (any destination)', async () => {
      const res = await agent
        .put(`/api/data-destinations/${dataDestinationId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Updated by Viewer',
          credentials: { type: 'looker-studio-credentials' },
        });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/data-destinations/:id → 200 (own destination)', async () => {
      const res = await agent
        .delete(`/api/data-destinations/${viewerDestinationId}`)
        .set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
    });
  });

  // ─── Business User Report ownership ─────────────────────────

  describe('Business User — Report ownership-based access', () => {
    let viewerReportId: string;
    let adminReportId: string;

    it('POST /api/reports → 201 (viewer creates report with published DM)', async () => {
      const payload = new ReportBuilder()
        .withTitle('Viewer Report')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();

      const res = await agent.post('/api/reports').set(VIEWER_AUTH_HEADER).send(payload);

      expect(res.status).toBe(201);
      viewerReportId = res.body.id;
      expect(res.body.ownerUsers).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: '2' })])
      );
    });

    it('admin creates a report (not owned by viewer)', async () => {
      // Use a separate destination to avoid deterministic UUID collision
      const destRes = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Admin Dest for Report')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(destRes.status).toBe(201);

      const payload = new ReportBuilder()
        .withTitle('Admin Report')
        .withDataMartId(dataMartId)
        .withDataDestinationId(destRes.body.id)
        .build();

      const res = await agent.post('/api/reports').set(AUTH_HEADER).send(payload);

      expect(res.status).toBe(201);
      adminReportId = res.body.id;
    });

    it('PUT /api/reports/:id → 200 (viewer edits own report)', async () => {
      const res = await agent
        .put(`/api/reports/${viewerReportId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Updated by Viewer',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated by Viewer');
    });

    it('PUT /api/reports/:id → 403 (viewer edits report NOT owned)', async () => {
      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Should Fail',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
    });

    it('DELETE /api/reports/:id → 403 (viewer deletes report NOT owned)', async () => {
      const res = await agent.delete(`/api/reports/${adminReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
    });

    it('DELETE /api/reports/:id → 200 (viewer deletes own report)', async () => {
      const res = await agent.delete(`/api/reports/${viewerReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
    });
  });

  // ─── Technical User — project-wide Report access ────────────

  describe('Technical User — project-wide Report access', () => {
    let reportId: string;

    beforeAll(async () => {
      const payload = new ReportBuilder()
        .withTitle('Report for Editor Test')
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();

      const res = await agent.post('/api/reports').set(AUTH_HEADER).send(payload);
      expect(res.status).toBe(201);
      reportId = res.body.id;
    });

    it('PUT /api/reports/:id → 200 (editor edits any report)', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'Updated by Editor',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated by Editor');
    });

    it('DELETE /api/reports/:id → 200 (editor deletes any report)', async () => {
      const res = await agent.delete(`/api/reports/${reportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(200);
    });
  });

  // ─── Ineffective owner ──────────────────────────────────────

  describe('Ineffective owner — destination soft-deleted', () => {
    let reportId: string;
    let tempDestinationId: string;

    beforeAll(async () => {
      const destRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Temp Destination')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(destRes.status).toBe(201);
      tempDestinationId = destRes.body.id;

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Report with temp dest')
            .withDataMartId(dataMartId)
            .withDataDestinationId(tempDestinationId)
            .build()
        );
      expect(reportRes.status).toBe(201);
      reportId = reportRes.body.id;

      // Force soft-delete via direct SQL
      const { DataSource } = await import('typeorm');
      const dataSource = app.get(DataSource);
      await dataSource.query(`UPDATE data_destination SET "deletedAt" = ? WHERE id = ?`, [
        new Date().toISOString(),
        tempDestinationId,
      ]);
    }, 60_000);

    it('PUT /api/reports/:id → 403 (owner but destination deleted)', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Should Fail',
          dataDestinationId: tempDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
    });
  });
});
