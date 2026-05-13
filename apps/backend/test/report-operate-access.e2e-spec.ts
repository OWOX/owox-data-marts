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
} from '@owox/test-utils';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { ScheduledTriggerType } from '../src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';
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

const REPORT_RUN_TYPE = ScheduledTriggerType.REPORT_RUN;
const CONNECTOR_RUN_TYPE = ScheduledTriggerType.CONNECTOR_RUN;
const REPORT_RUN_CONFIG_TYPE = 'scheduled-report-run-config' as const;

function reportTriggerPayload(reportId: string, cron = '0 * * * *') {
  return new ScheduledTriggerBuilder()
    .withType(REPORT_RUN_TYPE)
    .withCronExpression(cron)
    .withTimeZone('UTC')
    .withTriggerConfig({ type: REPORT_RUN_CONFIG_TYPE, reportId })
    .build();
}

/**
 * Permissions Model: report-operate-access (B1-B9 + edges).
 *
 * Admin (id=0), Editor (id=1, TU), Viewer (id=2, BU). Admin auto-becomes
 * Tech Owner of every DM and owner of every entity it creates.
 *
 * canOperate(report) = canSee(DataMart) AND canUse(Destination).
 * canMutate(report) = canSee(DataMart) AND (DM EDIT OR (Report Owner AND isEffective)).
 */
describe('Report Operate Access (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let dataDestinationId: string;
  let adminReportId: string;

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

    const adminReportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withTitle('Admin-owned Report')
          .withDataMartId(dataMartId)
          .withDataDestinationId(dataDestinationId)
          .build()
      );
    expect(adminReportRes.status).toBe(201);
    adminReportId = adminReportRes.body.id;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ────────────────────────────────────────────────────────────────
  // Manual run — POST /api/reports/:id/run
  // ────────────────────────────────────────────────────────────────

  describe('Manual run — POST /api/reports/:id/run', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // B1: BO of DM (Viewer role) runs report owned by someone else — 2xx
    it('B1: viewer who is Business Owner of DM runs admin-owned report → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // B4: Viewer with no BO but DM SHARED_FOR_REPORTING and Destination SHARED_FOR_USE — 2xx
    it('B4: viewer with DM shared-for-reporting + destination shared-for-use → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // B5: Viewer with NOT_SHARED DM and not BO — 403 dm-invisible
    it('B5: viewer with no path to DM (NOT_SHARED, not BO) → 403 dm-invisible', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/DataMart/i);
    });

    // B6: Viewer can see DM (shared-for-reporting) but Destination NOT shared — 403 destination-unusable
    it('B6: viewer sees DM but destination NOT shared → 403 destination-unusable', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/destination/i);
    });

    // B8: Report owner who lost USE on the destination — 403 destination-unusable (per-user isEffective)
    it('B8: report owner (viewer) loses destination USE → 403 destination-unusable', async () => {
      const isolated = await setupReportPrerequisites(agent);
      const isolatedDmId = isolated.dataMartId;

      const viewerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for B8')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(viewerDestRes.status).toBe(201);
      const viewerDestId = viewerDestRes.body.id;

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for B8')
            .withDataMartId(isolatedDmId)
            .withDataDestinationId(viewerDestId)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const viewerReportId = reportRes.body.id;
      expect(reportRes.body.ownerUsers.map((u: { userId: string }) => u.userId)).toContain('2');

      const okRun = await agent.post(`/api/reports/${viewerReportId}/run`).set(VIEWER_AUTH_HEADER);
      expect(okRun.status).toBe(201);

      const { DataSource } = await import('typeorm');
      const dataSource = app.get(DataSource);
      await dataSource.query(`UPDATE data_destination SET "deletedAt" = ? WHERE id = ?`, [
        new Date().toISOString(),
        viewerDestId,
      ]);

      const failRun = await agent
        .post(`/api/reports/${viewerReportId}/run`)
        .set(VIEWER_AUTH_HEADER);
      expect(failRun.status).toBe(403);
      expect(String(failRun.body.message ?? '')).toMatch(/destination/i);

      await dataSource.query(`DELETE FROM report WHERE id = ?`, [viewerReportId]);
    });

    // Edge: Tech Owner of DM (Editor role) runs an admin-owned report — 201
    it('edge: editor as Tech Owner of DM runs admin-owned report → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0', '1'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // Edge: Project Admin runs any report regardless of sharing — 201
    it('edge: project admin runs report regardless of sharing → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(AUTH_HEADER);

      expect(res.status).toBe(201);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // REPORT_RUN trigger CRUD — POST/PUT/DELETE /api/data-marts/:dmId/scheduled-triggers
  // ────────────────────────────────────────────────────────────────

  describe('REPORT_RUN trigger CRUD — /api/data-marts/:dmId/scheduled-triggers', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // B2: BO of DM creates REPORT_RUN trigger for someone else's report — 201, createdById = caller
    it('B2: viewer-as-BO creates REPORT_RUN trigger for admin-owned report → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId));

      expect(res.status).toBe(201);
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.type).toBe('REPORT_RUN');
      expect(res.body.createdById).toBe('2');

      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${res.body.id}`)
        .set(AUTH_HEADER);
    });

    // B3: BO of DM updates and deletes a REPORT_RUN trigger originally created by someone else — 200 for both
    it('B3: viewer-as-BO updates and deletes admin-created REPORT_RUN trigger → 200/200', async () => {
      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 1 * * *'));
      expect(createRes.status).toBe(201);
      expect(createRes.body.createdById).toBe('0');
      const triggerId = createRes.body.id;

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const updateRes = await agent
        .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          cronExpression: '0 2 * * *',
          timeZone: 'America/New_York',
          isActive: false,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.cronExpression).toBe('0 2 * * *');

      const deleteRes = await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER);
      expect(deleteRes.status).toBe(200);
    });

    // Negative: viewer with no DM path tries to create REPORT_RUN trigger — 403
    it('viewer with no DM access tries to create REPORT_RUN trigger → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId));

      expect(res.status).toBe(403);
    });

    // Regression: editor (TU) without BO of DM but DM SHARED_FOR_BOTH — should still be 201 (no regression)
    it('editor (non-owner TU) on DM shared-for-both creates REPORT_RUN trigger → 201', async () => {
      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId));

      expect(res.status).toBe(201);
      expect(res.body.createdById).toBe('1');

      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${res.body.id}`)
        .set(AUTH_HEADER);
    });

    // Cross-DM attack: trigger on dm-X with reportId belonging to a report on dm-Y — non-2xx (400)
    it('cross-DM attack: REPORT_RUN trigger on dm-X with reportId from dm-Y → non-2xx', async () => {
      const otherSetup = await setupReportPrerequisites(agent);
      const otherDmId = otherSetup.dataMartId;

      const reportOnOtherDmRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Report on other DM')
            .withDataMartId(otherDmId)
            .withDataDestinationId(otherSetup.dataDestinationId)
            .build()
        );
      expect(reportOnOtherDmRes.status).toBe(201);
      const otherReportId = reportOnOtherDmRes.body.id;

      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(otherReportId));

      expect(res.status).not.toBe(201);
      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      await agent.delete(`/api/reports/${otherReportId}`).set(AUTH_HEADER);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // CONNECTOR_RUN sanity — must NOT regress
  // ────────────────────────────────────────────────────────────────

  describe('CONNECTOR_RUN sanity (no regression)', () => {
    let connectorDmId: string;

    beforeAll(async () => {
      const cd = await setupConnectorDataMart(agent, app);
      connectorDmId = cd.dataMartId;
      await agent
        .put(`/api/data-marts/${connectorDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    }, 120_000);

    it('admin (Tech Owner with maintenance) creates CONNECTOR_RUN trigger → 201', async () => {
      const res = await agent
        .post(`/api/data-marts/${connectorDmId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(new ScheduledTriggerBuilder().withType(CONNECTOR_RUN_TYPE).build());

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('CONNECTOR_RUN');

      await agent
        .delete(`/api/data-marts/${connectorDmId}/scheduled-triggers/${res.body.id}`)
        .set(AUTH_HEADER);
    });

    it('viewer-as-BO of DM tries to create CONNECTOR_RUN trigger → 403', async () => {
      await agent
        .put(`/api/data-marts/${connectorDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const res = await agent
        .post(`/api/data-marts/${connectorDmId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(new ScheduledTriggerBuilder().withType(CONNECTOR_RUN_TYPE).build());

      expect(res.status).toBe(403);

      await agent
        .put(`/api/data-marts/${connectorDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Edit-config protection — canMutate path must NOT regress
  // ────────────────────────────────────────────────────────────────

  describe('Edit-config protection (canMutate, no regression)', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
    });

    // B7: BO of DM (not Owner of report) tries to PUT report config — 403
    it('B7: viewer-as-BO of DM tries PUT /api/reports/:id (edit config) → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'BO Should Not Edit',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
    });

    it('viewer-as-BO of DM tries DELETE /api/reports/:id → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });

      const res = await agent.delete(`/api/reports/${adminReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // B9: Capability fields on responses
  // ────────────────────────────────────────────────────────────────

  describe('B9: capability fields canRun / canManageTriggers / canEditConfig', () => {
    let archetypeReportId: string;
    let archetypeDmId: string;
    let archetypeDestId: string;

    beforeAll(async () => {
      const setup = await setupReportPrerequisites(agent);
      archetypeDmId = setup.dataMartId;
      archetypeDestId = setup.dataDestinationId;

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned archetype report')
            .withDataMartId(archetypeDmId)
            .withDataDestinationId(archetypeDestId)
            .build()
        );
      expect(reportRes.status).toBe(201);
      archetypeReportId = reportRes.body.id;
    }, 60_000);

    afterAll(async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-marts/${archetypeDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
    });

    it('Project Admin → canRun = canManageTriggers = canEditConfig = true', async () => {
      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(true);
    });

    it('Report Owner with effective Destination → all three true', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(true);
    });

    it('Report Owner who lost Destination USE → canRun=canManageTriggers=canEditConfig=false', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(false);
      expect(res.body.canManageTriggers).toBe(false);
      expect(res.body.canEditConfig).toBe(false);
    });

    it('BO of DM (not Owner) with usable destination → canRun=canManageTriggers=true, canEditConfig=false', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${archetypeDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['1'], technicalOwnerIds: ['0'] });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(false);
    });

    it('TU shared-for-reporting + usable destination → canRun=canManageTriggers=true, canEditConfig=false', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(false);
    });

    it('Caller can SEE DM but destination not USE-able → all three false', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${archetypeDestId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(false);
      expect(res.body.canManageTriggers).toBe(false);
      expect(res.body.canEditConfig).toBe(false);
    });

    it('Caller has no DM access → GET returns 403', async () => {
      await agent
        .put(`/api/data-marts/${archetypeDmId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${archetypeDmId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });

      const res = await agent.get(`/api/reports/${archetypeReportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // B9 (cont.) — capability fields exposed on list endpoints
  // ────────────────────────────────────────────────────────────────

  describe('B9: capability fields on list endpoints', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    it('GET /api/reports/data-mart/:dmId carries capability flags for BO viewer', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['2'], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/data-mart/${dataMartId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((r: { id: string }) => r.id === adminReportId);
      expect(found).toBeDefined();
      expect(found.canRun).toBe(true);
      expect(found.canManageTriggers).toBe(true);
      expect(found.canEditConfig).toBe(false);
    });

    it('GET /api/reports (project list) carries capability flags for admin caller', async () => {
      const res = await agent.get('/api/reports').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((r: { id: string }) => r.id === adminReportId);
      expect(found).toBeDefined();
      expect(found.canRun).toBe(true);
      expect(found.canManageTriggers).toBe(true);
      expect(found.canEditConfig).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // B9 (cont.) — capability fields on POST/PUT report responses (C1 regression)
  // ────────────────────────────────────────────────────────────────

  describe('B9: capability fields on POST/PUT report responses (C1 regression)', () => {
    let isolatedDmId: string;
    let isolatedDestId: string;

    beforeAll(async () => {
      const setup = await setupReportPrerequisites(agent);
      isolatedDmId = setup.dataMartId;
      isolatedDestId = setup.dataDestinationId;
    }, 60_000);

    it('POST /api/reports returns canRun/canManageTriggers/canEditConfig in body', async () => {
      const res = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Capability-flag check')
            .withDataMartId(isolatedDmId)
            .withDataDestinationId(isolatedDestId)
            .build()
        );

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('canRun');
      expect(res.body).toHaveProperty('canManageTriggers');
      expect(res.body).toHaveProperty('canEditConfig');
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(true);
    });

    it('PUT /api/reports/:id returns canRun/canManageTriggers/canEditConfig in body', async () => {
      const getRes = await agent.get(`/api/reports/data-mart/${isolatedDmId}`).set(AUTH_HEADER);
      expect(getRes.status).toBe(200);
      const targetReportId = getRes.body[0]?.id;
      expect(targetReportId).toBeDefined();

      const res = await agent
        .put(`/api/reports/${targetReportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Updated for cap check',
          dataDestinationId: isolatedDestId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('canRun');
      expect(res.body).toHaveProperty('canManageTriggers');
      expect(res.body).toHaveProperty('canEditConfig');
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Gap fill — Manual run (A1-A7)
  // ────────────────────────────────────────────────────────────────

  describe('Gap fill — Manual run (A1-A7)', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // A1: DM Tech Owner (Editor) on own DM, but Destination NOT shared / no USE → 403
    it('A1: editor as DM Tech Owner with destination not USE-able → 403 destination-unusable', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0', '1'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/destination/i);
    });

    // A2: Editor (TU) non-owner + DM SHARED_FOR_REPORTING + Destination usable → 200
    it('A2: editor non-owner + DM shared-for-reporting + destination usable → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // A3: Editor (TU) non-owner + DM SHARED_FOR_MAINTENANCE + Destination usable → 200
    it('A3: editor non-owner + DM shared-for-maintenance + destination usable → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // A4: Editor (TU) non-owner + DM SHARED_FOR_BOTH + Destination usable → 200
    it('A4: editor non-owner + DM shared-for-both + destination usable → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // A5: Viewer non-owner non-BO + DM SHARED_FOR_BOTH + Destination usable → 200
    it('A5: viewer non-owner non-BO + DM shared-for-both + destination usable → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(201);
    });

    // A6: Viewer non-owner non-BO + DM SHARED_FOR_MAINTENANCE only → 403
    // Per access matrix (apps/backend/src/data-marts/services/access-decision/access-matrix.config.ts):
    // BU non-owner + SHARED_FOR_MAINTENANCE = no access (BU cannot do maintenance).
    it('A6: viewer non-owner non-BO + DM shared-for-maintenance only → 403 dm-invisible', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.post(`/api/reports/${adminReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/DataMart/i);
    });

    // A7: Report Owner with effective Destination runs own report → 200 (golden path)
    it('A7: report owner with effective destination runs own report → 201', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for A7')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);
      const ownerDestId = ownerDestRes.body.id;

      const ownerReportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for A7')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestId)
            .build()
        );
      expect(ownerReportRes.status).toBe(201);
      const ownerReportId = ownerReportRes.body.id;

      const res = await agent.post(`/api/reports/${ownerReportId}/run`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(201);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Gap fill — Trigger CRUD (B1-B8)
  // ────────────────────────────────────────────────────────────────

  describe('Gap fill — Trigger CRUD (B1-B8)', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // B1: DM Business Owner updates a trigger created by another Business Owner
    it('B1: viewer-as-BO updates trigger created by editor-as-BO → 200', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['1', '2'], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(EDITOR_AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 3 * * *'));
      expect(createRes.status).toBe(201);
      expect(createRes.body.createdById).toBe('1');
      const triggerId = createRes.body.id;

      const updateRes = await agent
        .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          cronExpression: '0 4 * * *',
          timeZone: 'UTC',
          isActive: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.cronExpression).toBe('0 4 * * *');

      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(AUTH_HEADER);
    });

    // B2: Report Owner creates / updates / deletes their own REPORT_RUN trigger
    it('B2: report owner creates/updates/deletes own REPORT_RUN trigger → 201/200/200', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for B2')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);

      const ownerReportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for B2')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestRes.body.id)
            .build()
        );
      expect(ownerReportRes.status).toBe(201);
      const ownerReportId = ownerReportRes.body.id;

      const createRes = await agent
        .post(`/api/data-marts/${isolated.dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(reportTriggerPayload(ownerReportId, '0 5 * * *'));
      expect(createRes.status).toBe(201);
      expect(createRes.body.createdById).toBe('2');
      const triggerId = createRes.body.id;

      const updateRes = await agent
        .put(`/api/data-marts/${isolated.dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          cronExpression: '0 6 * * *',
          timeZone: 'UTC',
          isActive: false,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.cronExpression).toBe('0 6 * * *');
      expect(updateRes.body.isActive).toBe(false);

      const deleteRes = await agent
        .delete(`/api/data-marts/${isolated.dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER);
      expect(deleteRes.status).toBe(200);
    });

    // B3: Viewer + DM SHARED_FOR_REPORTING non-owner non-BO creates a REPORT_RUN trigger
    it('B3: viewer non-owner non-BO + DM shared-for-reporting + dest usable → 201', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 7 * * *'));

      expect(res.status).toBe(201);
      expect(res.body.createdById).toBe('2');

      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${res.body.id}`)
        .set(AUTH_HEADER);
    });

    // B4: Same viewer updates and deletes a REPORT_RUN trigger created by someone else
    it('B4: viewer non-owner non-BO updates and deletes admin-created REPORT_RUN trigger → 200/200', async () => {
      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 8 * * *'));
      expect(createRes.status).toBe(201);
      const triggerId = createRes.body.id;

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const updateRes = await agent
        .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          cronExpression: '0 9 * * *',
          timeZone: 'UTC',
          isActive: true,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.cronExpression).toBe('0 9 * * *');

      const deleteRes = await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER);
      expect(deleteRes.status).toBe(200);
    });

    // B5: Viewer with no DM access tries to UPDATE an existing trigger → 403
    it('B5: viewer with no DM access updates existing trigger → 403', async () => {
      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 10 * * *'));
      expect(createRes.status).toBe(201);
      const triggerId = createRes.body.id;

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent
        .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          cronExpression: '0 11 * * *',
          timeZone: 'UTC',
          isActive: false,
        });

      expect(res.status).toBe(403);

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(AUTH_HEADER);
    });

    // B6: Viewer with no DM access tries to DELETE an existing trigger → 403
    it('B6: viewer with no DM access deletes existing trigger → 403', async () => {
      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 12 * * *'));
      expect(createRes.status).toBe(201);
      const triggerId = createRes.body.id;

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);

      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(AUTH_HEADER);
    });

    // B7: Destination shared with one BO but not another → second BO cannot create trigger
    // Simulates "Destination access revoked between report-create and trigger-create" by creating
    // a fresh DM with two BOs and a destination that only the first BO can USE.
    it('B7: BO whose destination is not USE-able fails trigger create → 403 destination-unusable', async () => {
      const isolated = await setupReportPrerequisites(agent);

      // Make admin Tech Owner only; viewer is BO; editor is also BO (both can SEE the DM via BO).
      await agent
        .put(`/api/data-marts/${isolated.dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });
      await agent
        .put(`/api/data-marts/${isolated.dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: ['1', '2'], technicalOwnerIds: ['0'] });

      // Destination usable for both initially → admin creates a report.
      await agent
        .put(`/api/data-destinations/${isolated.dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const reportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Report for B7')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(isolated.dataDestinationId)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForB7 = reportRes.body.id;

      // Now revoke destination availability for non-owners. Viewer (BU) is not a destination owner,
      // so it loses USE; same for editor.
      await agent
        .put(`/api/data-destinations/${isolated.dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent
        .post(`/api/data-marts/${isolated.dataMartId}/scheduled-triggers`)
        .set(VIEWER_AUTH_HEADER)
        .send(reportTriggerPayload(reportIdForB7, '0 13 * * *'));

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/destination/i);
    });

    // B8: Cross-DM attack on UPDATE — supply unknown triggerConfig field → 400 (validation)
    it('B8: cross-DM attack on UPDATE with extra triggerConfig field → 4xx (validator rejects)', async () => {
      const createRes = await agent
        .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER)
        .send(reportTriggerPayload(adminReportId, '0 14 * * *'));
      expect(createRes.status).toBe(201);
      const triggerId = createRes.body.id;

      const otherSetup = await setupReportPrerequisites(agent);
      const otherReportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Report on other DM (B8)')
            .withDataMartId(otherSetup.dataMartId)
            .withDataDestinationId(otherSetup.dataDestinationId)
            .build()
        );
      expect(otherReportRes.status).toBe(201);
      const otherReportId = otherReportRes.body.id;

      const res = await agent
        .put(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(AUTH_HEADER)
        .send({
          cronExpression: '0 15 * * *',
          timeZone: 'UTC',
          isActive: true,
          triggerConfig: { type: REPORT_RUN_CONFIG_TYPE, reportId: otherReportId },
        });

      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      await agent
        .delete(`/api/data-marts/${dataMartId}/scheduled-triggers/${triggerId}`)
        .set(AUTH_HEADER);
      await agent.delete(`/api/reports/${otherReportId}`).set(AUTH_HEADER);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Gap fill — Edit-config (C1-C12)
  // ────────────────────────────────────────────────────────────────

  describe('Gap fill — Edit-config (C1-C12)', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // C1: Viewer + DM SHARED_FOR_REPORTING non-owner non-BO tries PUT → 403
    it('C1: viewer non-owner non-BO + DM shared-for-reporting tries PUT → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Viewer non-owner cannot edit',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
    });

    // C2: Same Viewer tries DELETE → 403
    it('C2: viewer non-owner non-BO + DM shared-for-reporting tries DELETE → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.delete(`/api/reports/${adminReportId}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
    });

    // C3: Editor (TU) non-owner + DM SHARED_FOR_REPORTING (no maintenance) tries PUT → 403
    it('C3: editor non-owner + DM shared-for-reporting tries PUT non-owned report → 403', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: false });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'Editor non-owner reporting only cannot edit',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
    });

    // C4: Editor (TU) non-owner + DM SHARED_FOR_MAINTENANCE → PUT non-owned report = 200 (DM bypass)
    it('C4: editor non-owner + DM shared-for-maintenance tries PUT → 200 (DM maintenance bypass)', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'Editor with DM maintenance edits',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Editor with DM maintenance edits');
    });

    // C5: DM Tech Owner (Editor on own DM) tries PUT non-owned report on own DM → 200
    it('C5: editor as DM Tech Owner tries PUT non-owned report → 200', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0', '1'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${adminReportId}`)
        .set(EDITOR_AUTH_HEADER)
        .send({
          title: 'DM Tech Owner edits',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('DM Tech Owner edits');
    });

    // C6: Report Owner with effective Destination tries PUT (changing title) → 200 (golden path)
    it('C6: report owner with effective destination tries PUT → 200', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for C6')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for C6')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestRes.body.id)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForC6 = reportRes.body.id;

      const res = await agent
        .put(`/api/reports/${reportIdForC6}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Owner edits title',
          dataDestinationId: ownerDestRes.body.id,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Owner edits title');
    });

    // C7: Report Owner with effective Destination tries DELETE → 200 (golden path)
    it('C7: report owner with effective destination tries DELETE → 200', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for C7')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for C7')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestRes.body.id)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForC7 = reportRes.body.id;

      const res = await agent.delete(`/api/reports/${reportIdForC7}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
    });

    // C8: Report Owner who lost Destination USE tries PUT → 403 ineffective.
    // Cleaner mechanism than soft-delete: admin owns the destination, viewer is added as
    // report owner via admin-create with ownerIds=['2']. Then admin flips availableForUse=false.
    // Viewer is non-owner on the destination (admin owns it), so loses USE.
    it('C8: report owner who lost destination USE tries PUT → 403 ineffective', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const reportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send({
          ...new ReportBuilder()
            .withTitle('Report for C8')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(isolated.dataDestinationId)
            .build(),
          ownerIds: ['2'],
        });
      expect(reportRes.status).toBe(201);
      const reportIdForC8 = reportRes.body.id;

      const okPut = await agent
        .put(`/api/reports/${reportIdForC8}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Owner edits while effective',
          dataDestinationId: isolated.dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });
      expect(okPut.status).toBe(200);

      await agent
        .put(`/api/data-destinations/${isolated.dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${reportIdForC8}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Owner edits while ineffective',
          dataDestinationId: isolated.dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/destination/i);
    });

    // C9: Report Owner who lost Destination USE tries DELETE → 403 ineffective.
    it('C9: report owner who lost destination USE tries DELETE → 403 ineffective', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const reportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send({
          ...new ReportBuilder()
            .withTitle('Report for C9')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(isolated.dataDestinationId)
            .build(),
          ownerIds: ['2'],
        });
      expect(reportRes.status).toBe(201);
      const reportIdForC9 = reportRes.body.id;

      await agent
        .put(`/api/data-destinations/${isolated.dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent.delete(`/api/reports/${reportIdForC9}`).set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(String(res.body.message ?? '')).toMatch(/destination/i);
    });

    // C10: Owner tries PUT with new dataDestinationId pointing to a Destination they can't USE → 4xx.
    it('C10: owner tries PUT with non-USE-able dataDestinationId → 4xx', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for C10')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for C10')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestRes.body.id)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForC10 = reportRes.body.id;

      // Admin-only destination (viewer is not owner).
      const adminOnlyDestRes = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Admin-only dest for C10')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(adminOnlyDestRes.status).toBe(201);
      await agent
        .put(`/api/data-destinations/${adminOnlyDestRes.body.id}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${reportIdForC10}`)
        .set(VIEWER_AUTH_HEADER)
        .send({
          title: 'Owner switches to non-USE dest',
          dataDestinationId: adminOnlyDestRes.body.id,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    // C11: Owner tries PUT adding a new ownerIds member who lacks DM SEE or Destination USE → 4xx
    it('C11: owner tries PUT adding ownerIds member without DM SEE → 4xx (canBeOwner)', async () => {
      const isolated = await setupReportPrerequisites(agent);

      // Admin owns dest and report; only admin BO + admin TU on the DM.
      // Viewer (id=2) has no path to DM (NOT_SHARED + not BO + not TO).
      const reportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Report for C11')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(isolated.dataDestinationId)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForC11 = reportRes.body.id;

      await agent
        .put(`/api/data-marts/${isolated.dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent
        .put(`/api/reports/${reportIdForC11}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Adding invalid owner',
          dataDestinationId: isolated.dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          ownerIds: ['0', '2'],
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    // C12: Project Admin tries PUT and DELETE an admin-not-owned report → 200, 200 (admin bypass)
    it('C12: admin tries PUT and DELETE viewer-owned report → 200/200', async () => {
      const isolated = await setupReportPrerequisites(agent);

      const ownerDestRes = await agent
        .post('/api/data-destinations')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new DataDestinationBuilder()
            .withTitle('Viewer-owned dest for C12')
            .withType(DataDestinationType.LOOKER_STUDIO)
            .withCredentials({ type: 'looker-studio-credentials' })
            .build()
        );
      expect(ownerDestRes.status).toBe(201);

      const reportRes = await agent
        .post('/api/reports')
        .set(VIEWER_AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withTitle('Viewer-owned report for C12')
            .withDataMartId(isolated.dataMartId)
            .withDataDestinationId(ownerDestRes.body.id)
            .build()
        );
      expect(reportRes.status).toBe(201);
      const reportIdForC12 = reportRes.body.id;
      expect(reportRes.body.ownerUsers.map((u: { userId: string }) => u.userId)).not.toContain('0');

      const putRes = await agent
        .put(`/api/reports/${reportIdForC12}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Admin edits viewer-owned report',
          dataDestinationId: ownerDestRes.body.id,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.title).toBe('Admin edits viewer-owned report');

      const delRes = await agent.delete(`/api/reports/${reportIdForC12}`).set(AUTH_HEADER);
      expect(delRes.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Gap fill — Capability fields (D1, D2)
  // ────────────────────────────────────────────────────────────────

  describe('Gap fill — Capability fields (D1, D2)', () => {
    afterEach(async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0'] });
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: true, availableForMaintenance: true });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true });
    });

    // D1: GET as DM Tech Owner (Editor) with maintenance, not Report Owner → all three true
    it('D1: editor as DM Tech Owner with maintenance bypass → canRun/canManageTriggers/canEditConfig all true', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ businessOwnerIds: [], technicalOwnerIds: ['0', '1'] });
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false });

      const res = await agent.get(`/api/reports/${adminReportId}`).set(EDITOR_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.canRun).toBe(true);
      expect(res.body.canManageTriggers).toBe(true);
      expect(res.body.canEditConfig).toBe(true);
    });

    // D2a: insight-template list endpoint returns 200 + array for admin (no email reports exist).
    it('D2a: GET insight-template list as admin returns 200 array', async () => {
      const res = await agent
        .get(
          `/api/reports/data-mart/${dataMartId}/insight-template/00000000-0000-0000-0000-000000000000`
        )
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    // D2b: insight-template list endpoint as viewer with no DM access.
    // The endpoint filters by destinationConfig email/insight-template; existing test data uses
    // LOOKER_STUDIO so the result is always [] regardless of DM visibility — confirm that semantics.
    it('D2b: GET insight-template list as viewer without DM access returns 200 empty array', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForReporting: false, availableForMaintenance: false });

      const res = await agent
        .get(
          `/api/reports/data-mart/${dataMartId}/insight-template/00000000-0000-0000-0000-000000000000`
        )
        .set(VIEWER_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });
  });
});
