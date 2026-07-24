import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
} from '@owox/test-utils';
import { NullIdpProvider, Payload, ProjectMember } from '@owox/idp-protocol';

// ---------------------------------------------------------------------------
// Proves report-level HTTP Data (GET /api/external/http-data/reports/:id.ndjson)
// rejects a report that belongs to ANOTHER project, and records no run in that
// case. StreamHttpDataService.streamReport loads the report via
// reportService.getByIdAndProjectId(reportId, projectId), which inner-joins on
// dataMart.projectId — a report from a foreign project must 404, not leak
// existence or fall through to the DWH.
//
// Mirrors the MultiTenantIdpProvider pattern from
// notification-settings-cross-project.e2e-spec.ts: a dedicated app instance
// with an IdpProvider that maps distinct tokens to distinct tenants. The
// AUTH_HEADER token is mapped to tenant A so the shared setup helpers
// (setupReportPrerequisites, ReportBuilder), which hardcode AUTH_HEADER
// internally, create their fixtures under tenant A's project unmodified.
// ---------------------------------------------------------------------------
const TENANT_A: Payload = {
  userId: 'user-a',
  email: 'a@test.com',
  roles: ['admin'],
  fullName: 'User A',
  projectId: 'project-a',
};
const TENANT_B: Payload = {
  userId: 'user-b',
  email: 'b@test.com',
  roles: ['admin'],
  fullName: 'User B',
  projectId: 'project-b',
};

const TENANT_B_TOKEN = 'token-b';

const TOKENS: Record<string, Payload> = {
  [AUTH_HEADER['x-owox-authorization']]: TENANT_A,
  [TENANT_B_TOKEN]: TENANT_B,
};

function toProjectMember(payload: Payload): ProjectMember {
  return {
    userId: payload.userId,
    email: payload.email!,
    fullName: payload.fullName,
    avatar: undefined,
    projectRole: 'admin',
    userStatus: 'active',
    hasNotificationsEnabled: true,
    isOutbound: false,
  };
}

class MultiTenantIdpProvider extends NullIdpProvider {
  async parseToken(token: string): Promise<Payload | null> {
    return TOKENS[token] ?? null;
  }

  async introspectToken(token: string): Promise<Payload | null> {
    return TOKENS[token] ?? null;
  }

  // Ownership validation (e.g. data-storage/data-mart create) checks that the
  // acting user is a project member — NullIdpProvider's default always returns
  // a single hard-coded member ('0'), which would reject both tenants A and B.
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    if (projectId === TENANT_A.projectId) return [toProjectMember(TENANT_A)];
    if (projectId === TENANT_B.projectId) return [toProjectMember(TENANT_B)];
    return [];
  }
}

const TENANT_B_HEADER: Record<string, string> = { 'x-owox-authorization': TENANT_B_TOKEN };

interface RunsListResponse {
  runs?: Array<{ id: string; type: string }>;
}

describe('HTTP Data — report cross-project isolation (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    // Swap the IDP provider stored on the express app so guard-time
    // parse/introspect maps tokens to distinct tenants (see notification-
    // settings-cross-project.e2e-spec.ts for the same pattern).
    const provider = new MultiTenantIdpProvider();
    await provider.initialize();
    (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
      'idp',
      provider
    );
  }, 120_000);

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('returns 404 and records no run for a report owned by another project', async () => {
    // Created entirely under tenant A: setupReportPrerequisites and the report
    // POST both use AUTH_HEADER internally, which resolves to TENANT_A above.
    const prereqs = await setupReportPrerequisites(agent);
    const createRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withDataMartId(prereqs.dataMartId)
          .withDataDestinationId(prereqs.dataDestinationId)
          .build()
      );
    expect(createRes.status).toBe(201);
    const reportId = createRes.body.id;

    const before = await agent.get(`/api/data-marts/${prereqs.dataMartId}/runs`).set(AUTH_HEADER);
    expect(before.status).toBe(200);
    const beforeRunCount = ((before.body as RunsListResponse).runs ?? []).length;

    // Tenant B requests tenant A's report by id — must not be found.
    const res = await agent
      .get(`/api/external/http-data/reports/${reportId}.ndjson`)
      .set(TENANT_B_HEADER);
    expect(res.status).toBe(404);

    // No HTTP_DATA run (or any run) was recorded for the foreign-project attempt.
    const after = await agent.get(`/api/data-marts/${prereqs.dataMartId}/runs`).set(AUTH_HEADER);
    expect(after.status).toBe(200);
    const afterRunCount = ((after.body as RunsListResponse).runs ?? []).length;
    expect(afterRunCount).toBe(beforeRunCount);

    // Sanity: the report genuinely exists and is owned by tenant A (proves the
    // 404 above was about cross-project rejection, not a malformed/missing id).
    // Uses the report detail endpoint rather than re-invoking the streaming
    // endpoint, which would hit the real (unmocked) storage reader in this app.
    const ownerRes = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.id).toBe(reportId);
  });
});
