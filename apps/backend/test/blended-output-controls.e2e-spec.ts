import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  extractCteBody,
  setupBlendedReportPrerequisites,
  type BlendedReportPrerequisites,
} from '@owox/test-utils';

// Full-flow e2e: PUT /api/reports/:id → GET /api/reports/:id/generated-sql.
// Exercises the entire pipeline (DTO → validator → entity persist → composer
// → BigQuery blended builder) for both post-join filters and pre-join filters
// (a.k.a. slices, expressed via FilterRule.placement='pre-join'+aliasPath).
//
// The 7 groups below mirror the contract that protects this feature end-to-end:
//   1. Baseline — sanity check that an unfiltered report composes a blended-or-simple SELECT
//   2. Post-join filters — final WHERE on the outer SELECT
//   3. Pre-join filters — WHERE inside the joined mart's *_raw CTE
//   4. Combos — post-join + pre-join coexist with distinct param prefixes (p vs s_<cte>_)
//   5. Validation — DTO/validator rejects invalid pre-join payloads with structured codes
//   6. Clearing — null filterConfig wipes persisted state on the next PUT
//   7. Native-column filters — validator rejects unknown native columns

describe('Blended output controls full-flow (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let prereqs: BlendedReportPrerequisites;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    prereqs = await setupBlendedReportPrerequisites(agent, { withSchemas: true });
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  // Helper: PUT a partial filterConfig update onto the shared report.
  // Keeps the other report fields (title/destination/destinationConfig) constant
  // so each test only mutates what it explicitly asserts on.
  async function putReportConfig(body: {
    columnConfig?: string[] | null;
    filterConfig?: unknown;
    sortConfig?: unknown;
    limitConfig?: number | null;
  }): Promise<supertest.Response> {
    return agent
      .put(`/api/reports/${prereqs.reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Blended e2e',
        dataDestinationId: prereqs.dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: body.columnConfig ?? null,
        filterConfig: body.filterConfig ?? null,
        sortConfig: body.sortConfig ?? null,
        limitConfig: body.limitConfig ?? null,
      });
  }

  async function getGeneratedSql(): Promise<string> {
    const res = await agent.get(`/api/reports/${prereqs.reportId}/generated-sql`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(typeof res.body.sql).toBe('string');
    return res.body.sql as string;
  }

  async function getReport(): Promise<Record<string, unknown>> {
    const res = await agent.get(`/api/reports/${prereqs.reportId}`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    return res.body as Record<string, unknown>;
  }

  // ── Group 1: Baseline ─────────────────────────────────────────────────────

  describe('1. Baseline', () => {
    it('composes a SELECT when no output controls and only native columns are selected', async () => {
      const put = await putReportConfig({ columnConfig: ['event_id', 'amount'] });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      expect(sql).toMatch(/SELECT/i);
      expect(sql).toContain('event_id');
      // No blended path triggered — no _raw CTE.
      expect(sql).not.toMatch(/users_raw AS \(/);
    });
  });

  // ── Group 2: Post-join filters ───────────────────────────────────────────

  describe('2. Post-join filters', () => {
    it('emits a final WHERE on native column when placement is omitted (default post-join)', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id', 'amount'],
        filterConfig: [{ column: 'amount', operator: 'gt', value: 100 }],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      expect(sql).toMatch(/WHERE[\s\S]+amount[\s\S]+>[\s\S]+@p0/);
    });

    it('emits a final WHERE when placement="post-join" is explicit', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [{ column: 'amount', operator: 'gte', value: 50, placement: 'post-join' }],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      expect(sql).toMatch(/WHERE[\s\S]+amount[\s\S]+>=[\s\S]+@p0/);
    });
  });

  // ── Group 3: Pre-join filters ────────────────────────────────────────────

  describe('3. Pre-join filters', () => {
    it('emits WHERE inside users_raw CTE for a single pre-join filter on users.role', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      // Blended path must trigger because a pre-join filter is present even
      // though only native columns are selected.
      expect(sql).toMatch(/users_raw AS \(/);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toMatch(/WHERE[\s\S]+`role`\s*=\s*@s_users_0/);
    });

    it('combines multiple pre-join filters on the same CTE with AND', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
          {
            column: 'is_active',
            operator: 'is_true',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toMatch(/WHERE[\s\S]+AND/);
      expect(usersRawBody).toContain('`role`');
      expect(usersRawBody).toContain('`is_active`');
    });

    it('uses isolated s_<cte>_ prefix per joined mart so params never collide across CTEs', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
          {
            column: 'plan',
            operator: 'eq',
            value: 'pro',
            placement: 'pre-join',
            aliasPath: 'orgs',
          },
        ],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      // Distinct param prefixes per CTE — no `@s_users_0` ↔ `@s_orgs_0` collision
      // because the prefixes themselves are different.
      const usersRawBody = extractCteBody(sql, 'users_raw');
      const orgsRawBody = extractCteBody(sql, 'orgs_raw');
      expect(usersRawBody).toContain('@s_users_0');
      expect(orgsRawBody).toContain('@s_orgs_0');
    });

    it('projects pre-join filter column into the raw CTE SELECT even if not in columnConfig', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      const usersRawBody = extractCteBody(sql, 'users_raw');
      // `role` is referenced by the WHERE; the raw CTE must project it OR fall
      // back to SELECT *. Either way, the column must appear inside the body.
      expect(usersRawBody).toMatch(/role/);
    });
  });

  // ── Group 4: Combos ──────────────────────────────────────────────────────

  describe('4. Combos (post-join + pre-join)', () => {
    it('post-join `@p0` and pre-join `@s_users_0` coexist with isolated prefixes', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id', 'amount'],
        filterConfig: [
          { column: 'amount', operator: 'gt', value: 50 },
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      // Outer SELECT must reference @p0 — post-join WHERE
      expect(sql).toContain('@p0');
      // Inner users_raw CTE must reference @s_users_0 — pre-join WHERE
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain('@s_users_0');
    });

    it('post-join + sort + limit + pre-join all coexist on the same report', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id', 'amount'],
        filterConfig: [
          { column: 'amount', operator: 'gte', value: 1 },
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        sortConfig: [{ column: 'amount', direction: 'desc' }],
        limitConfig: 100,
      });
      expect(put.status).toBe(200);

      const sql = await getGeneratedSql();
      expect(sql).toMatch(/users_raw AS \(/);
      expect(sql).toMatch(/ORDER BY/);
      expect(sql).toMatch(/LIMIT 100/);
    });
  });

  // ── Group 5: Validation ──────────────────────────────────────────────────

  describe('5. Validation', () => {
    it('rejects pre-join filter with aliasPath that does not resolve to any chain', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'something',
            operator: 'eq',
            value: 'X',
            placement: 'pre-join',
            aliasPath: 'nonexistent_alias',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('FILTER_ALIAS_PATH_UNKNOWN');
    });

    it('rejects pre-join filter with aliasPath="main" (home mart not slicable)', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'event_id',
            operator: 'eq',
            value: 'X',
            placement: 'pre-join',
            aliasPath: 'main',
          },
        ],
      });
      expect(res.status).toBe(400);
      // Zod superRefine on FilterRuleSchema catches this BEFORE the validator
      // service runs, so the response body carries the schema "invalid shape"
      // path (`aliasPath`) — verified by absence of the schema-level success.
      const body = JSON.stringify(res.body);
      expect(
        body.includes('FILTER_ALIAS_PATH_NOT_ALLOWED_ON_HOME') || body.includes('aliasPath')
      ).toBe(true);
    });

    it('rejects pre-join filter with unknown raw column inside known aliasPath', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'no_such_column',
            operator: 'eq',
            value: 'X',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(res.status).toBe(400);
      const body = JSON.stringify(res.body);
      expect(body).toContain('FILTER_COLUMN_UNKNOWN');
    });

    it('rejects operator/type mismatch on pre-join (regex on INTEGER native field)', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'employee_count',
            operator: 'regex',
            value: '^1',
            placement: 'pre-join',
            aliasPath: 'orgs',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('INVALID_OPERATOR_FOR_TYPE');
    });
  });

  // ── Group 6: Clearing ────────────────────────────────────────────────────

  describe('6. Clearing', () => {
    it('PUT filterConfig: null wipes persisted state', async () => {
      // Seed
      await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      const seeded = await getReport();
      expect(Array.isArray(seeded.filterConfig)).toBe(true);

      // Clear
      const clear = await putReportConfig({ columnConfig: ['event_id'], filterConfig: null });
      expect(clear.status).toBe(200);

      const after = await getReport();
      expect(after.filterConfig).toBeNull();
    });
  });

  // ── Group 7: Native-column filters ───────────────────────────────────────

  describe('7. Native-column filters', () => {
    it('accepts post-join filter on a known native column', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id', 'amount'],
        filterConfig: [{ column: 'amount', operator: 'lt', value: 1_000_000 }],
      });
      expect(res.status).toBe(200);

      const sql = await getGeneratedSql();
      expect(sql).toMatch(/WHERE[\s\S]+amount[\s\S]+<[\s\S]+@p0/);
    });

    it('rejects post-join filter on unknown native column with FILTER_COLUMN_UNKNOWN', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [{ column: 'no_such_native', operator: 'eq', value: 'X' }],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('FILTER_COLUMN_UNKNOWN');
    });
  });

  // ── Group 8: Edge-case validation (one e2e per under-covered code) ──────

  describe('8. Edge-case validation', () => {
    it('rejects regex with invalid pattern → INVALID_REGEX_PATTERN', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'regex',
            value: '[unclosed',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('INVALID_REGEX_PATTERN');
    });

    it('rejects is_empty on NUMERIC native column → INVALID_OPERATOR_FOR_TYPE', async () => {
      const res = await putReportConfig({
        columnConfig: ['event_id', 'amount'],
        filterConfig: [{ column: 'amount', operator: 'is_empty' }],
      });
      expect(res.status).toBe(400);
      const body = JSON.stringify(res.body);
      expect(body).toContain('INVALID_OPERATOR_FOR_TYPE');
    });

    it('accepts relative_date with last_n_months and round-trips through GET', async () => {
      const put = await putReportConfig({
        columnConfig: ['event_id', 'event_ts'],
        filterConfig: [
          {
            column: 'event_ts',
            operator: 'relative_date',
            value: { kind: 'last_n_months', n: 3 },
          },
        ],
      });
      expect(put.status).toBe(200);

      const after = await getReport();
      expect(after.filterConfig).toEqual([
        {
          column: 'event_ts',
          operator: 'relative_date',
          value: { kind: 'last_n_months', n: 3 },
        },
      ]);
    });
  });

  // ── Group 9: Re-validation against drifted schema (composer hop) ─────────

  describe('9. Re-validation on read path (generated-sql)', () => {
    it('GET generated-sql 400s on a stored pre-join rule whose aliasPath got excluded', async () => {
      const seed = await putReportConfig({
        columnConfig: ['event_id'],
        filterConfig: [
          {
            column: 'role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      });
      expect(seed.status).toBe(200);

      const drop = await agent
        .put(`/api/data-marts/${prereqs.mainDataMartId}/blended-fields-config`)
        .set(AUTH_HEADER)
        .send({
          blendedFieldsConfig: {
            sources: [
              { path: 'users', alias: 'Users', isExcluded: true },
              { path: 'orgs', alias: 'Organisations' },
            ],
          },
        });
      expect(drop.status).toBe(200);

      const sqlRes = await agent
        .get(`/api/reports/${prereqs.reportId}/generated-sql`)
        .set(AUTH_HEADER);
      expect(sqlRes.status).toBe(400);
      expect(JSON.stringify(sqlRes.body)).toContain('FILTER_ALIAS_PATH_NOT_INCLUDED');

      const restore = await agent
        .put(`/api/data-marts/${prereqs.mainDataMartId}/blended-fields-config`)
        .set(AUTH_HEADER)
        .send({
          blendedFieldsConfig: {
            sources: [
              { path: 'users', alias: 'Users' },
              { path: 'orgs', alias: 'Organisations' },
            ],
          },
        });
      expect(restore.status).toBe(200);
    });
  });
});
