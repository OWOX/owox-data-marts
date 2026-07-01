import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp } from '@owox/test-utils';
import { NullIdpProvider, Payload } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';

// ---------------------------------------------------------------------------
// Two distinct tenants, each with a valid token. We override the express-app
// IDP provider so that `parseToken` / `introspectToken` resolve a token to a
// project, mirroring how a real multi-tenant deployment behaves.
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

const TOKENS: Record<string, Payload> = {
  'token-a': TENANT_A,
  'token-b': TENANT_B,
};

class MultiTenantIdpProvider extends NullIdpProvider {
  async parseToken(token: string): Promise<Payload | null> {
    return TOKENS[token] ?? null;
  }

  async introspectToken(token: string): Promise<Payload | null> {
    return TOKENS[token] ?? null;
  }
}

const headerForTenant = (token: string): Record<string, string> => ({
  'x-owox-authorization': token,
});

// IdpProjectionsFacade is bypassed for project-member lookups so that the
// notifications use-cases see a deterministic, per-tenant member list. Without
// this override, getProjectMembers would hit the real (Null) IDP which returns
// the same hard-coded admin for every project — useless for an isolation test.
const MEMBER_A = new ProjectMemberDto(
  TENANT_A.userId,
  TENANT_A.email!,
  TENANT_A.fullName,
  undefined,
  'admin',
  true,
  false
);
const MEMBER_B = new ProjectMemberDto(
  TENANT_B.userId,
  TENANT_B.email!,
  TENANT_B.fullName,
  undefined,
  'admin',
  true,
  false
);

const mockIdpProjectionsFacade = {
  getProjectMembers: jest.fn(async (projectId: string) => {
    if (projectId === TENANT_A.projectId) return [MEMBER_A];
    if (projectId === TENANT_B.projectId) return [MEMBER_B];
    return [];
  }),
  getUserProjectionList: jest.fn(async (userIds: string[]) => ({
    projections: userIds.map(id => {
      const tenant = id === TENANT_A.userId ? TENANT_A : id === TENANT_B.userId ? TENANT_B : null;
      return tenant
        ? {
            userId: tenant.userId,
            email: tenant.email,
            fullName: tenant.fullName,
            avatar: undefined,
            hasNotificationsEnabled: true,
          }
        : { userId: id };
    }),
  })),
  getProjectProjection: jest.fn().mockResolvedValue(undefined),
  getUserProjection: jest.fn().mockResolvedValue(undefined),
};

const BASE_URL = '/api/projects/notification-settings';

describe('Notification Settings — multi-tenant isolation (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: IdpProjectionsFacade, useValue: mockIdpProjectionsFacade },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    // Swap the IDP provider stored on the express app so guard-time
    // parse/introspect maps tokens to distinct tenants.
    const provider = new MultiTenantIdpProvider();
    await provider.initialize();
    (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
      'idp',
      provider
    );

    // Seed user projections so UpsertNotificationSettingService can enrich
    // receivers via IdpProjectionsService.getUserProjectionList (which reads
    // local DB, not the facade we mocked above).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const backendRoot = require.resolve('@owox/backend/package.json');
    const backendDir = require('path').dirname(backendRoot);
    const { DataSource } = require(require.resolve('typeorm', { paths: [backendDir] }));
    /* eslint-enable @typescript-eslint/no-require-imports */
    const dataSource = app.get(DataSource);
    for (const t of [TENANT_A, TENANT_B]) {
      await dataSource.query(
        `INSERT INTO user_projection (userId, email, fullName, avatar, createdAt, modifiedAt)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [t.userId, t.email, t.fullName, null]
      );
    }
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // ---------------------------------------------------------------------------
  // With :projectId removed from the URL, the request can only ever target the
  // tenant baked into the authenticated token. Each tenant gets its own
  // settings, and writes by one are invisible to the other.
  // ---------------------------------------------------------------------------
  describe('two tenants get isolated settings', () => {
    it('each tenant initializes its own default settings', async () => {
      const resA = await agent.get(BASE_URL).set(headerForTenant('token-a'));
      const resB = await agent.get(BASE_URL).set(headerForTenant('token-b'));

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Each tenant only sees their own admin in the receiver list — proves
      // settings were created under the auth-context project, not shared.
      const failedA = resA.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM'
      );
      const failedB = resB.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM'
      );
      const receiversA = failedA.receivers.map((r: Record<string, unknown>) => r.userId);
      const receiversB = failedB.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiversA).toEqual([TENANT_A.userId]);
      expect(receiversB).toEqual([TENANT_B.userId]);
    });

    it('tenant A writes do not leak to tenant B', async () => {
      const putA = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(headerForTenant('token-a'))
        .send({
          enabled: false,
          webhookUrl: 'https://hooks.example.com/tenant-a',
          groupingDelayCron: '0 * * * *',
        });
      expect(putA.status).toBe(200);
      expect(putA.body.webhookUrl).toBe('https://hooks.example.com/tenant-a');

      // Tenant B re-reads and must NOT see tenant A's webhook or enabled flag.
      const getB = await agent.get(BASE_URL).set(headerForTenant('token-b'));
      const failedB = getB.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM'
      );
      expect(failedB.webhookUrl).toBeNull();
      expect(failedB.enabled).toBe(true); // tenant B still has default
    });

    it('GET /members returns the calling tenant only', async () => {
      const resA = await agent.get(`${BASE_URL}/members`).set(headerForTenant('token-a'));
      const resB = await agent.get(`${BASE_URL}/members`).set(headerForTenant('token-b'));

      expect(resA.body.members.map((m: Record<string, unknown>) => m.userId)).toEqual([
        TENANT_A.userId,
      ]);
      expect(resB.body.members.map((m: Record<string, unknown>) => m.userId)).toEqual([
        TENANT_B.userId,
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated / unknown-token requests must be rejected before reaching
  // any tenant's data.
  // ---------------------------------------------------------------------------
  describe('unknown tokens are rejected', () => {
    it('rejects request with an unknown token', async () => {
      const res = await agent.get(BASE_URL).set('x-owox-authorization', 'totally-not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('rejects request with no auth header', async () => {
      const res = await agent.get(BASE_URL);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Defense-in-depth: TenantGuardService verifies command.projectId against
  // CLS. If a future controller or internal caller passes the wrong project
  // id, the use-case must refuse — even though the controller currently
  // sources the project from context.projectId directly.
  // ---------------------------------------------------------------------------
  describe('TenantGuardService blocks tampered use-case calls', () => {
    it('forces 403 if a use-case is run with a projectId other than CLS', async () => {
      const { ClsService } = await import('nestjs-cls');
      const cls = app.get(ClsService);
      const { GetNotificationSettingsService } =
        await import('../src/notifications/use-cases/get-notification-settings.service');
      const { GetNotificationSettingsCommand } =
        await import('../src/notifications/dto/domain/get-notification-settings.command');
      const { AUTH_CONTEXT } = await import('../src/idp/guards/idp.guard');

      const service = app.get(GetNotificationSettingsService);

      // Seed CLS as tenant A but call the use-case for tenant B — this is the
      // exact bypass we are defending against.
      await cls.run(async () => {
        cls.set(AUTH_CONTEXT, {
          userId: TENANT_A.userId,
          projectId: TENANT_A.projectId,
          roles: TENANT_A.roles,
        });
        await expect(
          service.run(new GetNotificationSettingsCommand(TENANT_B.projectId))
        ).rejects.toMatchObject({ status: 403 });
      });
    });
  });
});
