import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, AUTH_HEADER } from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';

/**
 * E2E coverage for the Membership Requests controller — pins the
 * controller → use-case → facade wire contract.
 *
 * NullIdpProvider authenticates the AUTH_HEADER as the default admin in
 * project `0`, so the `Role.admin(Strategy.INTROSPECT)` guard passes.
 * `IdpProjectionsFacade` is overridden so each test can shape the upstream
 * response (success / 404 / partial-failure) without standing up a fake
 * Java service.
 */

const PROJECT_ID = '0';
const BASE_URL = '/api/members';
const REQUESTS_URL = `${BASE_URL}/requests`;

const REQUEST_FIXTURE = {
  requestId: 'req-alice',
  email: 'alice@example.com',
  fullName: 'Alice Example',
  avatar: undefined,
  userId: 'user-alice',
  requestedRole: 'viewer',
  createdAt: '2026-05-01T10:00:00.000Z',
};

/**
 * Mirrors the shape `IdpNotFoundException` produces in production —
 * `name === 'IdpNotFoundException'` is the primary signal `isIdpNotFoundError`
 * matches on, with a `status: 404` fallback for any transport that drops
 * the class name.
 */
function makeIdpNotFound(): Error {
  return Object.assign(new Error('Upstream resource not found'), {
    name: 'IdpNotFoundException',
    status: 404,
  });
}

describe('Membership Requests (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  const mockFacade = {
    listMembershipRequests: jest.fn(),
    approveMembershipRequest: jest.fn(),
    declineMembershipRequest: jest.fn(),
  };

  beforeAll(async () => {
    const testApp = await createTestApp([{ provide: IdpProjectionsFacade, useValue: mockFacade }]);
    app = testApp.app;
    agent = testApp.agent;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GET /members/requests
  // ---------------------------------------------------------------------------
  describe(`GET ${REQUESTS_URL}`, () => {
    it('returns mapped membership requests with ProjectRole values', async () => {
      mockFacade.listMembershipRequests.mockResolvedValue([REQUEST_FIXTURE]);

      const res = await agent.get(REQUESTS_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(mockFacade.listMembershipRequests).toHaveBeenCalledWith(PROJECT_ID, '0');
      expect(res.body).toEqual([
        {
          requestId: 'req-alice',
          email: 'alice@example.com',
          fullName: 'Alice Example',
          userId: 'user-alice',
          requestedRole: 'viewer',
          createdAt: '2026-05-01T10:00:00.000Z',
        },
      ]);
    });

    it('returns empty array when no requests are pending', async () => {
      mockFacade.listMembershipRequests.mockResolvedValue([]);

      const res = await agent.get(REQUESTS_URL).set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /members/requests/:requestId/approve
  // ---------------------------------------------------------------------------
  describe(`POST ${REQUESTS_URL}/:requestId/approve`, () => {
    it('approves and responds with the persisted scope/contexts (not the input echo)', async () => {
      mockFacade.approveMembershipRequest.mockResolvedValue({ userId: 'user-alice' });

      const res = await agent
        .post(`${REQUESTS_URL}/${REQUEST_FIXTURE.requestId}/approve`)
        .set(AUTH_HEADER)
        .send({ role: 'editor' });

      expect(res.status).toBe(200);
      expect(mockFacade.approveMembershipRequest).toHaveBeenCalledWith(
        PROJECT_ID,
        REQUEST_FIXTURE.requestId,
        'editor',
        '0'
      );
      expect(res.body).toMatchObject({
        userId: 'user-alice',
        role: 'editor',
        roleScope: 'entire_project',
        contextIds: [],
      });
    });

    it('admin role + contextIds → response reflects coerced (entire_project, [])', async () => {
      mockFacade.approveMembershipRequest.mockResolvedValue({ userId: 'user-bob' });

      const res = await agent
        .post(`${REQUESTS_URL}/req-bob/approve`)
        .set(AUTH_HEADER)
        .send({ role: 'admin', roleScope: 'selected_contexts', contextIds: [] });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        userId: 'user-bob',
        role: 'admin',
        roleScope: 'entire_project',
        contextIds: [],
      });
    });

    it('IDP 404 → 404 Not Found (matches Swagger spec, not 500)', async () => {
      mockFacade.approveMembershipRequest.mockRejectedValue(makeIdpNotFound());

      const res = await agent
        .post(`${REQUESTS_URL}/stale-req/approve`)
        .set(AUTH_HEADER)
        .send({ role: 'viewer' });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('stale-req'),
      });
    });

    it('rejects malformed role with 400 (class-validator at the boundary)', async () => {
      const res = await agent
        .post(`${REQUESTS_URL}/req-x/approve`)
        .set(AUTH_HEADER)
        .send({ role: 'superuser' });

      expect(res.status).toBe(400);
      expect(mockFacade.approveMembershipRequest).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /members/requests/:requestId/decline
  // ---------------------------------------------------------------------------
  describe(`POST ${REQUESTS_URL}/:requestId/decline`, () => {
    it('declines and returns 204 No Content', async () => {
      mockFacade.declineMembershipRequest.mockResolvedValue(undefined);

      const res = await agent
        .post(`${REQUESTS_URL}/${REQUEST_FIXTURE.requestId}/decline`)
        .set(AUTH_HEADER)
        .send({});

      expect(res.status).toBe(204);
      expect(mockFacade.declineMembershipRequest).toHaveBeenCalledWith(
        PROJECT_ID,
        REQUEST_FIXTURE.requestId,
        '0'
      );
    });

    it('returns 404 when the request is unknown to the IDP (symmetric with approve)', async () => {
      mockFacade.declineMembershipRequest.mockRejectedValue(makeIdpNotFound());

      const res = await agent
        .post(`${REQUESTS_URL}/already-declined/decline`)
        .set(AUTH_HEADER)
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
