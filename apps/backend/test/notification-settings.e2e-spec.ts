import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';

const PROJECT_ID = '0';
const BASE_URL = `/api/projects/${PROJECT_ID}/notification-settings`;

describe('Notification Settings (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  // -------------------------------------------------------------------------
  // GET /projects/:projectId/notification-settings
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL}`, () => {
    // NOTIF-01
    // Flow: Auth(viewer, PARSE) → GetNotificationSettingsService.run()
    //   → IdpProjectionsFacade.getProjectMembers('0')
    //       → NullIdpProvider returns [{userId:'0', email:'admin@localhost', role:'admin'}]
    //   → settingsService.getOrCreateDefaultSettings()
    //       → creates 2 settings: FAILED_RUNS_ALL_DM (enabled:true), SUCCESSFUL_RUNS_ALL_DM (enabled:false)
    //       → default receivers = [admin members] = ['0']
    //   → syncReceivers() — no-op (member '0' already in receivers)
    //   → getUserProjectionList(['0']) — queries local DB for user projections
    //   → mapper.toResponseList() with titles from NOTIFICATION_TITLES map
    //   → 200 { settings: [...] }
    it('returns default settings for both notification types', async () => {
      const res = await agent.get(BASE_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('settings');
      expect(Array.isArray(res.body.settings)).toBe(true);
      expect(res.body.settings).toHaveLength(2);

      const types = res.body.settings.map((s: Record<string, unknown>) => s.notificationType);
      expect(types).toContain('FAILED_RUNS_ALL_DM');
      expect(types).toContain('SUCCESSFUL_RUNS_ALL_DM');

      // FAILED_RUNS_ALL_DM defaults to enabled, SUCCESSFUL_RUNS_ALL_DM defaults to disabled
      const failedSetting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'FAILED_RUNS_ALL_DM',
      );
      expect(failedSetting.enabled).toBe(true);
      expect(failedSetting.title).toBe('Failed runs for all Data Marts');

      const successSetting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'SUCCESSFUL_RUNS_ALL_DM',
      );
      expect(successSetting.enabled).toBe(false);
      expect(successSetting.title).toBe('Success runs for all Data Marts');
    });

    // NOTIF-02
    // Flow: same as NOTIF-01, but second call — settings already exist in DB
    //   → getOrCreateDefaultSettings() finds existing records, returns them
    //   → each setting has: id, notificationType, title, enabled, receivers, groupingDelayCron, timestamps
    it('returns settings with correct structure on subsequent calls', async () => {
      const res = await agent.get(BASE_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const setting = res.body.settings[0];

      expect(setting).toHaveProperty('id');
      expect(setting).toHaveProperty('notificationType');
      expect(setting).toHaveProperty('title');
      expect(setting).toHaveProperty('enabled');
      expect(setting).toHaveProperty('receivers');
      expect(setting).toHaveProperty('groupingDelayCron');
      expect(setting).toHaveProperty('createdAt');
      expect(setting).toHaveProperty('modifiedAt');
      expect(Array.isArray(setting.receivers)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET /projects/:projectId/notification-settings/members
  // -------------------------------------------------------------------------
  describe(`GET ${BASE_URL}/members`, () => {
    // NOTIF-03
    // Flow: Auth(viewer, PARSE) → GetProjectMembersService.run()
    //   → IdpProjectionsFacade.getProjectMembers('0')
    //       → NullIdpProvider returns [{userId:'0', email:'admin@localhost', role:'admin'}]
    //   → maps to ProjectMemberApiDto[]
    //   → 200 { members: [{userId, email, displayName, role, hasNotificationsEnabled, isOutbound}] }
    it('returns project members from NullIdpProvider', async () => {
      const res = await agent.get(`${BASE_URL}/members`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('members');
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(res.body.members.length).toBeGreaterThanOrEqual(1);

      const admin = res.body.members.find(
        (m: Record<string, unknown>) => m.userId === '0',
      );
      expect(admin).toBeDefined();
      expect(admin.email).toBe('admin@localhost');
      expect(admin.role).toBe('admin');
      expect(admin.hasNotificationsEnabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /projects/:projectId/notification-settings/:notificationType
  // -------------------------------------------------------------------------
  describe(`PUT ${BASE_URL}/:notificationType`, () => {
    // NOTIF-04
    // Flow: Auth(editor, INTROSPECT) → UpsertNotificationSettingService.run()
    //   → settingsService.upsert(projectId, FAILED_RUNS_ALL_DM, { enabled: false })
    //       → finds existing setting (created by NOTIF-01)
    //       → updates enabled = false, saves to DB
    //   → idpProjectionsService.getUserProjectionList(receivers) → local DB query
    //   → mapper.toResponseItem() with user enrichment
    //   → 200 { id, notificationType, enabled: false, ... }
    it('disables a notification type', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.notificationType).toBe('FAILED_RUNS_ALL_DM');
      expect(res.body.enabled).toBe(false);
    });

    // NOTIF-05
    // Flow: same as NOTIF-04 but re-enables
    //   → upsert({ enabled: true }) → saves to DB
    //   → 200 { enabled: true }
    it('re-enables a notification type', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
    });

    // NOTIF-06
    // Flow: Auth → UpsertNotificationSettingService.run()
    //   → upsert({ webhookUrl: 'https://hooks.example.com/test' })
    //   → saves webhookUrl to DB
    //   → 200 { webhookUrl: 'https://hooks.example.com/test' }
    it('sets a webhook URL', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ webhookUrl: 'https://hooks.example.com/test' });

      expect(res.status).toBe(200);
      expect(res.body.webhookUrl).toBe('https://hooks.example.com/test');
    });

    // NOTIF-07
    // Flow: Auth → upsert({ webhookUrl: null }) → clears webhook
    //   → 200 { webhookUrl: null }
    it('clears a webhook URL by sending null', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ webhookUrl: null });

      expect(res.status).toBe(200);
      expect(res.body.webhookUrl).toBeNull();
    });

    // NOTIF-08
    // Flow: Auth → upsert({ groupingDelayCron: '*/30 * * * *' })
    //   → validates enum value via class-validator @IsEnum(GroupingDelayCron)
    //   → saves to DB, recalculates nextRunAt
    //   → 200 { groupingDelayCron: '*/30 * * * *' }
    it('updates grouping delay cron', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ groupingDelayCron: '*/30 * * * *' });

      expect(res.status).toBe(200);
      expect(res.body.groupingDelayCron).toBe('*/30 * * * *');
    });

    // NOTIF-09
    // Flow: @Param('notificationType', ParseEnumPipe(NotificationType))
    //   → 'INVALID_TYPE' not in NotificationType enum
    //   → ParseEnumPipe throws BadRequestException
    //   → 400
    it('returns 400 for invalid notification type', async () => {
      const res = await agent
        .put(`${BASE_URL}/INVALID_TYPE`)
        .set(AUTH_HEADER)
        .send({ enabled: true });

      expect(res.status).toBe(400);
    });

    // NOTIF-10
    // Flow: Auth → class-validator validates UpdateNotificationSettingApiDto
    //   → @IsUrl({ require_tld: false }) rejects value without protocol scheme
    //   → 400
    it('returns 400 for invalid webhook URL', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ webhookUrl: '://missing-scheme' });

      expect(res.status).toBe(400);
    });

    // NOTIF-11
    // Flow: Auth → class-validator validates UpdateNotificationSettingApiDto
    //   → @IsEnum(GroupingDelayCron) rejects 'invalid-cron'
    //   → 400
    it('returns 400 for invalid grouping delay cron', async () => {
      const res = await agent
        .put(`${BASE_URL}/FAILED_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({ groupingDelayCron: 'invalid-cron' });

      expect(res.status).toBe(400);
    });

    // NOTIF-12
    // Flow: Auth → upsert({ enabled, webhookUrl, groupingDelayCron }) — all at once
    //   → saves all fields atomically
    //   → 200 with all updated fields
    it('updates multiple fields in a single request', async () => {
      const res = await agent
        .put(`${BASE_URL}/SUCCESSFUL_RUNS_ALL_DM`)
        .set(AUTH_HEADER)
        .send({
          enabled: true,
          webhookUrl: 'https://hooks.example.com/success',
          groupingDelayCron: '0 */2 * * *',
        });

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.webhookUrl).toBe('https://hooks.example.com/success');
      expect(res.body.groupingDelayCron).toBe('0 */2 * * *');
    });

    // NOTIF-13
    // Flow: GET after PUT → verify changes persisted to DB
    //   → getOrCreateDefaultSettings finds existing settings
    //   → SUCCESSFUL_RUNS_ALL_DM should reflect NOTIF-12 changes
    it('persists changes visible in subsequent GET', async () => {
      const res = await agent.get(BASE_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const successSetting = res.body.settings.find(
        (s: Record<string, unknown>) => s.notificationType === 'SUCCESSFUL_RUNS_ALL_DM',
      );
      expect(successSetting.enabled).toBe(true);
      expect(successSetting.webhookUrl).toBe('https://hooks.example.com/success');
      expect(successSetting.groupingDelayCron).toBe('0 */2 * * *');
    });
  });

  // -------------------------------------------------------------------------
  // POST /projects/:projectId/notification-settings/:notificationType/test-webhook
  // -------------------------------------------------------------------------
  describe(`POST ${BASE_URL}/:notificationType/test-webhook`, () => {
    // NOTIF-14
    // Flow: Auth(editor, INTROSPECT) → TestNotificationWebhookService.run()
    //   → resolvedUrl = command.webhookUrl ?? stored setting webhookUrl
    //   → no webhookUrl in body, FAILED_RUNS_ALL_DM has webhookUrl=null (cleared in NOTIF-07)
    //   → throw BadRequestException('No webhook URL configured')
    //   → 400
    it('returns 400 when no webhook URL configured', async () => {
      const res = await agent
        .post(`${BASE_URL}/FAILED_RUNS_ALL_DM/test-webhook`)
        .set(AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
    });

    // NOTIF-15
    // Flow: Auth → TestNotificationWebhookService.run()
    //   → resolvedUrl = 'https://nonexistent.invalid/webhook'
    //   → webhookService.sendTestWebhook(url, ...) → fetch fails (DNS resolution error)
    //   → catch → throw BadRequestException(error.message)
    //   → 400
    it('returns 400 when webhook URL is unreachable', async () => {
      const res = await agent
        .post(`${BASE_URL}/FAILED_RUNS_ALL_DM/test-webhook`)
        .set(AUTH_HEADER)
        .send({ webhookUrl: 'https://nonexistent.invalid/webhook' });

      expect(res.status).toBe(400);
    });

    // NOTIF-16
    // Flow: @Param('notificationType', ParseEnumPipe(NotificationType))
    //   → 'INVALID_TYPE' not in enum → 400
    it('returns 400 for invalid notification type', async () => {
      const res = await agent
        .post(`${BASE_URL}/INVALID_TYPE/test-webhook`)
        .set(AUTH_HEADER)
        .send({ webhookUrl: 'https://hooks.example.com/test' });

      expect(res.status).toBe(400);
    });
  });
});
