import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  ReportBuilder,
  ScheduledTriggerBuilder,
  setupReportPrerequisites,
} from '@owox/test-utils';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import { ScheduledTriggerType } from '../src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../src/data-marts/scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';

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

function resolvePayload(token: string): Payload {
  return token.startsWith('editor') ? EDITOR_PAYLOAD : ADMIN_PAYLOAD;
}

describe('Project Data Mart activity list API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let reportDataMartId: string;
  let reportId: string;
  let scheduledTriggerId: string;
  let insightTemplateId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest.spyOn(idpProvider, 'introspectToken').mockImplementation(async token => {
      return resolvePayload(token);
    });
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async token => {
      return resolvePayload(token);
    });

    const reportPrereqs = await setupReportPrerequisites(agent);
    reportDataMartId = reportPrereqs.dataMartId;

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
      ]);

    const reportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withDataMartId(reportDataMartId)
          .withDataDestinationId(reportPrereqs.dataDestinationId)
          .withTitle('Project activity report')
          .build()
      );
    expect(reportRes.status).toBe(201);
    reportId = reportRes.body.id;

    const triggerRes = await agent
      .post(`/api/data-marts/${reportDataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(
        new ScheduledTriggerBuilder()
          .withType(ScheduledTriggerType.REPORT_RUN)
          .withTriggerConfig({
            type: ScheduledReportRunConfigType,
            reportId,
          })
          .build()
      );
    expect(triggerRes.status).toBe(201);
    scheduledTriggerId = triggerRes.body.id;

    const insightTemplateRes = await agent
      .post(`/api/data-marts/${reportDataMartId}/insight-templates`)
      .set(AUTH_HEADER)
      .send({
        title: 'Project activity insight',
        template: '### Project activity insight',
      });
    expect(insightTemplateRes.status).toBe(201);
    insightTemplateId = insightTemplateRes.body.id;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('returns project activity lists with Data Mart references for admin', async () => {
    const reportsRes = await agent
      .get('/api/reports')
      .query({ limit: 100, offset: 0 })
      .set(AUTH_HEADER);
    const triggersRes = await agent
      .get('/api/data-marts/scheduled-triggers')
      .query({ limit: 100, offset: 0 })
      .set(AUTH_HEADER);
    const insightsRes = await agent
      .get('/api/data-marts/insight-templates')
      .query({ limit: 100, offset: 0 })
      .set(AUTH_HEADER);
    const runsRes = await agent
      .get('/api/data-marts/runs')
      .query({ limit: 100, offset: 0 })
      .set(AUTH_HEADER);

    expect(reportsRes.status).toBe(200);
    expect(triggersRes.status).toBe(200);
    expect(insightsRes.status).toBe(200);
    expect(runsRes.status).toBe(200);

    expect(reportsRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reportId,
          dataMart: expect.objectContaining({ id: reportDataMartId }),
        }),
      ])
    );
    expect(triggersRes.body.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: scheduledTriggerId,
          dataMart: expect.objectContaining({ id: reportDataMartId }),
          triggerConfig: expect.objectContaining({
            type: ScheduledReportRunConfigType,
            reportId,
            report: expect.objectContaining({ id: reportId }),
          }),
        }),
      ])
    );
    expect(insightsRes.body.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: insightTemplateId,
          dataMart: expect.objectContaining({ id: reportDataMartId }),
        }),
      ])
    );
    expect(Array.isArray(runsRes.body.runs)).toBe(true);
  });

  it('filters project activity lists by Data Mart visibility for non-owner users', async () => {
    await agent
      .put(`/api/data-marts/${reportDataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: false, availableForMaintenance: false });
    const reportsRes = await agent
      .get('/api/reports')
      .query({ limit: 100, offset: 0 })
      .set(EDITOR_AUTH_HEADER);
    const triggersRes = await agent
      .get('/api/data-marts/scheduled-triggers')
      .query({ limit: 100, offset: 0 })
      .set(EDITOR_AUTH_HEADER);
    const insightsRes = await agent
      .get('/api/data-marts/insight-templates')
      .query({ limit: 100, offset: 0 })
      .set(EDITOR_AUTH_HEADER);
    const runsRes = await agent
      .get('/api/data-marts/runs')
      .query({ limit: 100, offset: 0 })
      .set(EDITOR_AUTH_HEADER);

    expect(reportsRes.status).toBe(200);
    expect(triggersRes.status).toBe(200);
    expect(insightsRes.status).toBe(200);
    expect(runsRes.status).toBe(200);

    expect(reportsRes.body).toEqual([]);
    expect(triggersRes.body.triggers).toEqual([]);
    expect(insightsRes.body.insights).toEqual([]);
    expect(runsRes.body.runs).toEqual([]);
  });
});
