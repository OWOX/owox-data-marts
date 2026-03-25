import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';

// ---------------------------------------------------------------------------
// Mock: 3 project members with different roles
// ---------------------------------------------------------------------------
const ADMIN = new ProjectMemberDto('user-admin', 'admin@test.com', 'Admin User', undefined, 'admin', true, false);
const EDITOR = new ProjectMemberDto('user-editor', 'editor@test.com', 'Editor User', undefined, 'editor', true, false);
const VIEWER = new ProjectMemberDto('user-viewer', 'viewer@test.com', 'Viewer User', undefined, 'viewer', true, false);

const ALL_MEMBERS = [ADMIN, EDITOR, VIEWER];

const mockIdpProjectionsFacade = {
  // Flow: returns 3 members — admin, editor, viewer
  getProjectMembers: jest.fn().mockResolvedValue(ALL_MEMBERS),
  // Flow: queries local DB for user projections (seeded in beforeAll)
  getUserProjectionList: jest.fn().mockResolvedValue({
    projections: ALL_MEMBERS.map(m => ({
      userId: m.userId,
      email: m.email,
      fullName: m.displayName,
      avatar: m.avatarUrl,
      hasNotificationsEnabled: m.hasNotificationsEnabled,
    })),
  }),
  getProjectProjection: jest.fn().mockResolvedValue(undefined),
  getUserProjection: jest.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
const PROJECT_ID = '0';
const BASE_URL = `/api/projects/${PROJECT_ID}/notification-settings`;

describe('Notification Settings — Multi-Member (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: IdpProjectionsFacade, useValue: mockIdpProjectionsFacade },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    // Seed user_projections so UpsertNotificationSettingService (which uses
    // IdpProjectionsService directly, not the facade) can find users in local DB.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const backendRoot = require.resolve('@owox/backend/package.json');
    const backendDir = require('path').dirname(backendRoot);
    const { DataSource } = require(require.resolve('typeorm', { paths: [backendDir] }));
    /* eslint-enable @typescript-eslint/no-require-imports */
    const dataSource = app.get(DataSource);

    for (const m of ALL_MEMBERS) {
      await dataSource.query(
        `INSERT INTO user_projection (userId, email, fullName, avatar, createdAt, modifiedAt)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [m.userId, m.email, m.displayName, m.avatarUrl ?? null],
      );
    }
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdpProjectionsFacade.getProjectMembers.mockResolvedValue(ALL_MEMBERS);
    mockIdpProjectionsFacade.getUserProjectionList.mockResolvedValue({
      projections: ALL_MEMBERS.map(m => ({
        userId: m.userId,
        email: m.email,
        fullName: m.displayName,
        avatar: m.avatarUrl,
        hasNotificationsEnabled: m.hasNotificationsEnabled,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // GET members — multi-member
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL}/members`, () => {
    // MNOTIF-01
    // Flow: Auth → GetProjectMembersService.run()
    //   → IdpProjectionsFacade.getProjectMembers() → [MOCK: admin, editor, viewer]
    //   → maps to ProjectMemberApiDto[]
    //   → 200 { members: [{admin}, {editor}, {viewer}] }
    it('returns all 3 members with correct roles', async () => {
      const res = await agent.get(`${BASE_URL}/members`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(3);

      const roles = res.body.members.map((m: Record<string, unknown>) => m.role);
      expect(roles).toContain('admin');
      expect(roles).toContain('editor');
      expect(roles).toContain('viewer');
    });
  });

  // -------------------------------------------------------------------------
  // GET settings — default receivers = admin + editor (not viewer)
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL} — default receivers`, () => {
    // MNOTIF-02
    // Flow: Auth → GetNotificationSettingsService.run()
    //   → getProjectMembers() → [admin, editor, viewer]
    //   → activeMembers = all 3 (none are outbound)
    //   → getOrCreateDefaultSettings(projectId, defaultReceiversFn)
    //       → defaultReceiversFn = NOTIFICATION_DEFINITIONS[type].getDefaultReceivers(members)
    //       → filters: members.filter(m => m.role === 'admin' || m.role === 'editor')
    //       → default receivers = ['user-admin', 'user-editor'] — viewer excluded
    //   → 200 { settings with receivers: [admin, editor] }
    it('default receivers include admin and editor but not viewer', async () => {
      const res = await agent.get(BASE_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const setting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      expect(setting).toBeDefined();

      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toContain('user-admin');
      expect(receiverIds).toContain('user-editor');
      expect(receiverIds).not.toContain('user-viewer');
    });

    // MNOTIF-03
    // Flow: same, but check receiver enrichment — email, displayName from projections
    it('enriches receivers with profile data', async () => {
      const res = await agent.get(BASE_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const setting = res.body.settings[0];

      const adminReceiver = setting.receivers.find(
        (r: Record<string, unknown>) => r.userId === 'user-admin',
      );
      expect(adminReceiver).toBeDefined();
      expect(adminReceiver.email).toBe('admin@test.com');
      expect(adminReceiver.displayName).toBe('Admin User');
      expect(adminReceiver.hasNotificationsEnabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PUT — manage receivers
  // -------------------------------------------------------------------------
  describe(`PUT ${BASE_URL}/:type — receiver management`, () => {
    // MNOTIF-04
    // Flow: Auth → upsert({ receivers: ['user-admin'] })
    //   → removes 'user-editor' from receivers
    //   → stores optedOutReceivers (tracks manual edits)
    //   → 200 { receivers: [admin only] }
    it('updates receivers to admin only', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ receivers: ['user-admin'] });

      expect(res.status).toBe(200);
      const receiverIds = res.body.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toEqual(['user-admin']);
    });

    // MNOTIF-05
    // Flow: Auth → upsert({ receivers: ['user-admin', 'user-editor', 'user-viewer'] })
    //   → adds viewer to receivers (explicit opt-in by editor/admin)
    //   → 200 { receivers: [admin, editor, viewer] }
    it('allows adding viewer as explicit receiver', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ receivers: ['user-admin', 'user-editor', 'user-viewer'] });

      expect(res.status).toBe(200);
      const receiverIds = res.body.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toContain('user-admin');
      expect(receiverIds).toContain('user-editor');
      expect(receiverIds).toContain('user-viewer');
    });

    // MNOTIF-06
    // Flow: Auth → upsert({ receivers: [] }) → empty receivers list
    //   → 200 { receivers: [] }
    it('clears all receivers', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ receivers: [] });

      expect(res.status).toBe(200);
      expect(res.body.receivers).toEqual([]);
    });

    // MNOTIF-07
    // Flow: Auth → upsert({ receivers: ['user-admin', 'user-editor'] }) — restore
    //   → verify GET reflects the change
    it('restoring receivers persists in GET', async () => {
      await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ receivers: ['user-admin', 'user-editor'] });

      const res = await agent.get(BASE_URL).set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const setting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toContain('user-admin');
      expect(receiverIds).toContain('user-editor');
    });
  });

  // -------------------------------------------------------------------------
  // syncReceivers — member leaves project
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL} — syncReceivers on member removal`, () => {
    // MNOTIF-08
    // Flow: Auth → GetNotificationSettingsService.run()
    //   → getProjectMembers() → [MOCK: only admin + viewer — editor left]
    //   → syncReceivers():
    //       retainedReceivers = current.filter(id => memberIds.has(id) && eligibleIds.has(id))
    //       'user-editor' not in memberIds → removed from receivers
    //   → 200 { receivers: [admin only] — editor auto-removed }
    it('removes departed editor from receivers automatically', async () => {
      // First set receivers to admin + editor
      await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ receivers: ['user-admin', 'user-editor'] });

      // Now simulate editor leaving the project
      const membersWithoutEditor = [ADMIN, VIEWER];
      mockIdpProjectionsFacade.getProjectMembers.mockResolvedValue(membersWithoutEditor);

      const res = await agent.get(BASE_URL).set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const setting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toContain('user-admin');
      expect(receiverIds).not.toContain('user-editor');
    });

    // MNOTIF-09
    // Flow: viewer was never a default receiver and is still a member,
    //   but is not eligible (role=viewer) → stays excluded
    it('does not auto-add viewer even when other members leave', async () => {
      mockIdpProjectionsFacade.getProjectMembers.mockResolvedValue([ADMIN, VIEWER]);

      const res = await agent.get(BASE_URL).set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const setting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).not.toContain('user-viewer');
    });

    // MNOTIF-10
    // Flow: editor returns to project → syncReceivers auto-subscribes
    //   (because optedOutReceivers is initialized after first manual edit,
    //    and editor is not in optedOutReceivers → auto-subscribed)
    it('auto-subscribes returning editor who was not opted out', async () => {
      // Editor is back
      mockIdpProjectionsFacade.getProjectMembers.mockResolvedValue(ALL_MEMBERS);

      const res = await agent.get(BASE_URL).set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const setting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).toContain('user-admin');
      expect(receiverIds).toContain('user-editor');
    });
  });

  // -------------------------------------------------------------------------
  // Outbound member filtering
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL} — outbound member handling`, () => {
    // MNOTIF-11
    // Flow: outbound member (isOutbound=true) is excluded from activeMembers
    //   → not included in default receivers
    //   → not returned in members list
    it('excludes outbound members from receivers and member list', async () => {
      const OUTBOUND = new ProjectMemberDto(
        'user-outbound', 'outbound@test.com', 'Outbound User', undefined, 'editor', true, true,
      );
      mockIdpProjectionsFacade.getProjectMembers.mockResolvedValue([...ALL_MEMBERS, OUTBOUND]);

      const membersRes = await agent.get(`${BASE_URL}/members`).set(AUTH_HEADER);
      expect(membersRes.status).toBe(200);

      // Outbound member IS returned in members list (controller maps all members)
      const outboundMember = membersRes.body.members.find(
        (m: Record<string, unknown>) => m.userId === 'user-outbound',
      );
      expect(outboundMember).toBeDefined();
      expect(outboundMember.isOutbound).toBe(true);

      // But settings filter activeMembers = allMembers.filter(m => !m.isOutbound)
      // So outbound is NOT in default receivers
      const settingsRes = await agent.get(BASE_URL).set(AUTH_HEADER);
      expect(settingsRes.status).toBe(200);

      const setting = settingsRes.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      const receiverIds = setting.receivers.map((r: Record<string, unknown>) => r.userId);
      expect(receiverIds).not.toContain('user-outbound');
    });
  });
});
