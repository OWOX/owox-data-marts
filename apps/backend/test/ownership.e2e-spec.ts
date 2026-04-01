import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  StorageBuilder,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';

/**
 * Ownership Foundations E2E Tests
 *
 * Verifies:
 * - Creator is auto-assigned as owner on create
 * - Owners returned in GET responses (ownerUsers[])
 * - Owners updated via PUT (inline ownerIds in update payload)
 * - Empty owners state handled correctly
 * - Only project members can be owners (non-member rejected)
 * - Ownership is informational only (no access control changes)
 * - Owner filter on list endpoints (has_owners / no_owners)
 * - DataMart: PUT /owners endpoint with technical + business owners
 */
describe('Ownership (e2e)', () => {
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

  // ─── Storage Ownership ──────────────────────────────────

  describe('Storage Ownership', () => {
    let storageId: string;

    it('POST /api/data-storages - creator auto-assigned as owner', async () => {
      const payload = new StorageBuilder().withType('GOOGLE_BIGQUERY' as DataStorageType).build();
      const res = await agent.post('/api/data-storages').set(AUTH_HEADER).send(payload);

      expect(res.status).toBe(201);
      storageId = res.body.id;
    });

    it('GET /api/data-storages - list includes ownerUsers', async () => {
      const res = await agent.get('/api/data-storages').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const storage = res.body.find((s: Record<string, unknown>) => s.id === storageId);
      expect(storage).toBeDefined();
      expect(storage.ownerUsers).toBeDefined();
      expect(Array.isArray(storage.ownerUsers)).toBe(true);
      expect(storage.ownerUsers).toHaveLength(1);
      expect(storage.ownerUsers[0]).toMatchObject({ userId: '0' });
    });

    it('GET /api/data-storages/:id - returns ownerUsers', async () => {
      const res = await agent.get(`/api/data-storages/${storageId}`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toBeDefined();
      expect(res.body.ownerUsers).toHaveLength(1);
      expect(res.body.ownerUsers[0]).toMatchObject({ userId: '0' });
    });

    it('GET /api/data-storages?ownerFilter=has_owners - returns storages with owners', async () => {
      const res = await agent.get('/api/data-storages?ownerFilter=has_owners').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const ids = res.body.map((s: Record<string, unknown>) => s.id);
      expect(ids).toContain(storageId);
    });

    it('GET /api/data-storages?ownerFilter=no_owners - excludes storages with owners', async () => {
      const res = await agent.get('/api/data-storages?ownerFilter=no_owners').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const ids = res.body.map((s: Record<string, unknown>) => s.id);
      expect(ids).not.toContain(storageId);
    });
  });

  // ─── Destination Ownership ──────────────────────────────

  describe('Destination Ownership', () => {
    let destinationId: string;

    it('POST /api/data-destinations - creator auto-assigned as owner', async () => {
      const res = await agent
        .post('/api/data-destinations')
        .set(AUTH_HEADER)
        .send({
          title: 'Test Destination',
          type: 'LOOKER_STUDIO',
          credentials: { type: 'looker-studio-credentials' },
        });

      expect(res.status).toBe(201);
      expect(res.body.ownerUsers).toBeDefined();
      expect(res.body.ownerUsers).toHaveLength(1);
      expect(res.body.ownerUsers[0]).toMatchObject({ userId: '0' });
      destinationId = res.body.id;
    });

    it('GET /api/data-destinations - list includes ownerUsers', async () => {
      const res = await agent.get('/api/data-destinations').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const dest = res.body.find((d: Record<string, unknown>) => d.id === destinationId);
      expect(dest).toBeDefined();
      expect(dest.ownerUsers).toHaveLength(1);
    });
  });

  // ─── Report Ownership ──────────────────────────────────

  describe('Report Ownership', () => {
    let reportId: string;
    let dataMartId: string;
    let dataDestinationId: string;

    beforeAll(async () => {
      const prerequisites = await setupReportPrerequisites(agent);
      dataMartId = prerequisites.dataMartId;
      dataDestinationId = prerequisites.dataDestinationId;
    });

    it('POST /api/reports - creator auto-assigned as owner', async () => {
      const payload = new ReportBuilder()
        .withDataMartId(dataMartId)
        .withDataDestinationId(dataDestinationId)
        .build();

      const res = await agent.post('/api/reports').set(AUTH_HEADER).send(payload);

      expect(res.status).toBe(201);
      expect(res.body.ownerUsers).toBeDefined();
      expect(res.body.ownerUsers).toHaveLength(1);
      expect(res.body.ownerUsers[0]).toMatchObject({ userId: '0' });
      reportId = res.body.id;
    });

    it('GET /api/reports/:id - returns ownerUsers', async () => {
      const res = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toBeDefined();
      expect(res.body.ownerUsers).toHaveLength(1);
    });

    it('PUT /api/reports/:id - updates owners via ownerIds in payload', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Updated Report',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
          ownerIds: ['0', '1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toHaveLength(2);
      const userIds = res.body.ownerUsers.map((u: Record<string, unknown>) => u.userId);
      expect(userIds).toContain('0');
      expect(userIds).toContain('1');
    });

    it('PUT /api/reports/:id - clears owners with empty ownerIds', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Updated Report',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
          ownerIds: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toHaveLength(0);
    });

    it('PUT /api/reports/:id - rejects non-project-member as owner', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Updated Report',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
          ownerIds: ['nonexistent-user-id'],
        });

      expect(res.status).toBe(400);
    });
  });

  // ─── DataMart Ownership ─────────────────────────────────

  describe('DataMart Ownership', () => {
    let storageId: string;
    let dataMartId: string;

    beforeAll(async () => {
      // Create storage
      const storageRes = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send(new StorageBuilder().withType('GOOGLE_BIGQUERY' as DataStorageType).build());
      storageId = storageRes.body.id;

      // Create data mart
      const dmRes = await agent
        .post('/api/data-marts')
        .set(AUTH_HEADER)
        .send({ title: 'Ownership Test DM', storageId });
      dataMartId = dmRes.body.id;
    });

    it('GET /api/data-marts - creator auto-assigned as technical owner', async () => {
      const res = await agent.get('/api/data-marts').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const dm = res.body.items.find((d: Record<string, unknown>) => d.id === dataMartId);
      expect(dm).toBeDefined();
      expect(dm.technicalOwnerUsers).toHaveLength(1);
      expect(dm.technicalOwnerUsers[0]).toMatchObject({ userId: '0' });
      expect(dm.businessOwnerUsers).toHaveLength(0);
    });

    it('PUT /api/data-marts/:id/owners - updates technical and business owners', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({
          technicalOwnerIds: ['0', '1'],
          businessOwnerIds: ['2'],
        });

      expect(res.status).toBe(200);
      expect(res.body.technicalOwnerUsers).toHaveLength(2);
      expect(res.body.businessOwnerUsers).toHaveLength(1);
      expect(res.body.businessOwnerUsers[0]).toMatchObject({ userId: '2' });
    });

    it('PUT /api/data-marts/:id/owners - clears all owners', async () => {
      const res = await agent.put(`/api/data-marts/${dataMartId}/owners`).set(AUTH_HEADER).send({
        technicalOwnerIds: [],
        businessOwnerIds: [],
      });

      expect(res.status).toBe(200);
      expect(res.body.technicalOwnerUsers).toHaveLength(0);
      expect(res.body.businessOwnerUsers).toHaveLength(0);
    });

    it('PUT /api/data-marts/:id/owners - rejects non-project-member', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({
          technicalOwnerIds: ['nonexistent-user-id'],
          businessOwnerIds: [],
        });

      expect(res.status).toBe(400);
    });

    it('GET /api/data-marts?ownerFilter=no_owners - returns DMs without owners', async () => {
      const res = await agent.get('/api/data-marts?ownerFilter=no_owners').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const ids = res.body.items.map((d: Record<string, unknown>) => d.id);
      expect(ids).toContain(dataMartId);
    });

    it('PUT /api/data-marts/:id/owners - re-assign, then filter has_owners', async () => {
      await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({ technicalOwnerIds: ['0'], businessOwnerIds: [] });

      const res = await agent.get('/api/data-marts?ownerFilter=has_owners').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      const ids = res.body.items.map((d: Record<string, unknown>) => d.id);
      expect(ids).toContain(dataMartId);
    });

    it('PUT /api/data-marts/:id/owners - deduplicates ownerIds', async () => {
      const res = await agent
        .put(`/api/data-marts/${dataMartId}/owners`)
        .set(AUTH_HEADER)
        .send({
          technicalOwnerIds: ['0', '0', '0'],
          businessOwnerIds: ['1', '1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.technicalOwnerUsers).toHaveLength(1);
      expect(res.body.businessOwnerUsers).toHaveLength(1);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────

  describe('Edge Cases', () => {
    let reportId: string;
    let dataMartId: string;
    let dataDestinationId: string;

    beforeAll(async () => {
      // Create storage for tests
      const storageRes = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send(new StorageBuilder().withType('GOOGLE_BIGQUERY' as DataStorageType).build());
      storageId = storageRes.body.id;

      // Setup report prerequisites
      const prerequisites = await setupReportPrerequisites(agent);
      dataMartId = prerequisites.dataMartId;
      dataDestinationId = prerequisites.dataDestinationId;

      // Create report
      const reportRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withDataMartId(dataMartId)
            .withDataDestinationId(dataDestinationId)
            .build()
        );
      reportId = reportRes.body.id;
    });

    it('PUT without ownerIds - owners unchanged', async () => {
      // First set owners
      await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'With Owners',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          ownerIds: ['0', '1'],
        });

      // Update without ownerIds - owners should remain
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Title Only Update',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Title Only Update');
      expect(res.body.ownerUsers).toHaveLength(2);
    });

    it('Duplicate ownerIds in report update - deduplicates', async () => {
      const res = await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Dedup Test',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          ownerIds: ['0', '0', '1', '1', '1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toHaveLength(2);
    });

    it('Ghost owner - owner userId not in projections returns placeholder', async () => {
      // Assign a valid project member as owner
      await agent
        .put(`/api/reports/${reportId}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Ghost Test',
          dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          ownerIds: ['1'],
        });

      // GET should return ownerUsers with userId '1' even though they have no IDP projection
      const res = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ownerUsers).toHaveLength(1);
      expect(res.body.ownerUsers[0]).toMatchObject({ userId: '1' });
    });

    it('Scheduled trigger list has no ownerUsers field', async () => {
      // Triggers should NOT have ownership - verify via list endpoint
      const res = await agent
        .get(`/api/data-marts/${dataMartId}/scheduled-triggers`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      // Whether empty or not, triggers should not have ownerUsers
      if (Array.isArray(res.body) && res.body.length > 0) {
        expect(res.body[0].ownerUsers).toBeUndefined();
      }
      // No ownerUsers field in response schema
      expect(res.body.ownerUsers).toBeUndefined();
    });

    it('Ownership is informational - no access control impact', async () => {
      // Storage with no owners should still be accessible
      const noOwnerStorage = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send(new StorageBuilder().withType('GOOGLE_BIGQUERY' as DataStorageType).build());
      const noOwnerStorageId = noOwnerStorage.body.id;

      // GET still works (viewer-level access, no ownership check)
      const getRes = await agent.get(`/api/data-storages/${noOwnerStorageId}`).set(AUTH_HEADER);
      expect(getRes.status).toBe(200);

      // DELETE still works (editor-level access, no ownership check)
      const deleteRes = await agent
        .delete(`/api/data-storages/${noOwnerStorageId}`)
        .set(AUTH_HEADER);
      expect(deleteRes.status).toBe(200);
    });
  });
});
