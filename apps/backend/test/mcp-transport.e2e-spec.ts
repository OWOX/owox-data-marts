import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { closeTestApp, createTestApp, setupPublishedDataMart } from '@owox/test-utils';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../src/data-marts/data-storage-types/data-storage-providers';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import type { DataStorageReportReader } from '../src/data-marts/data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../src/data-marts/dto/domain/report-data-header.dto';
import { DataMartRun } from '../src/data-marts/entities/data-mart-run.entity';
import { DataMartRunStatus } from '../src/data-marts/enums/data-mart-run-status.enum';
import { DataMartRunType } from '../src/data-marts/enums/data-mart-run-type.enum';
import { DataMartTableReferenceService } from '../src/data-marts/services/data-mart-table-reference.service';
import { SourceDataLastUpdatedService } from '../src/data-marts/services/source-data-last-updated.service';
import { MCP_AUTH_PORT } from '../src/ee/mcp/auth/mcp-auth.port';
import type { McpAuthPort } from '../src/ee/mcp/auth/mcp-auth.port';
import type { QueryDataMartInput } from '../src/ee/mcp/tools/query-data-mart.input';

/**
 * Exercises the real createMcpHandler mount (McpHttpEntryService + McpAuthMiddleware) end to end:
 * a real @modelcontextprotocol/client talking real HTTP to a real listening NestJS app, not a
 * mocked McpServer/HttpAdapterHost like the unit specs use. NullIdpProvider's verifyMcpAccessToken
 * always returns null (it has no MCP support), so MCP_AUTH_PORT is overridden with a fake that
 * accepts one fixed test token for the shared MCP resource.
 */
describe('MCP transport (e2e)', () => {
  let app: INestApplication | undefined;
  let baseUrl: URL;
  let dataMartId: string;
  let runs: Repository<DataMartRun>;
  const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;
  const originalOwoxAuthPublicBaseUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;
  const TEST_TOKEN = 'e2e-mcp-token';
  let hasProjectAccess = true;

  const fakeAuthPort: McpAuthPort = {
    verifyToken: async (token, resource) => {
      if (token !== TEST_TOKEN || !hasProjectAccess) return null;
      return {
        clientId: 'e2e-client',
        // Matches the REST fixture's NullIdpProvider identity.
        userId: '0',
        projectId: '0',
        roles: ['admin'],
        resource,
        scopes: ['mcp:read', 'mcp:write'],
        authFlow: 'mcp',
      };
    },
  };

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';

    const reader: DataStorageReportReader = {
      type: DataStorageType.GOOGLE_BIGQUERY,
      honorsQueryTimeout: true,
      prepareReportData: async () => new ReportDataDescription([new ReportDataHeader('date')]),
      readReportDataBatch: async () => new ReportDataBatch([['2026-10-20']], null),
      finalize: async () => undefined,
      getState: () => null,
      initFromState: async () => undefined,
    };
    // Only warehouse I/O is replaced: the MCP tool, facade, composer, validators and run
    // persistence stay real, so a rejected request is checked against actual SQLite rows.
    const testApp = await createTestApp([
      { provide: MCP_AUTH_PORT, useValue: fakeAuthPort },
      {
        provide: DATA_STORAGE_REPORT_READER_RESOLVER,
        useValue: { resolve: async () => reader },
      },
      {
        provide: DataMartSchemaProviderFacade,
        useValue: {
          getActualDataMartSchema: async () => ({
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'date', type: 'DATE', mode: 'NULLABLE', status: 'CONNECTED' },
              { name: 'revenue', type: 'NUMERIC', mode: 'NULLABLE', status: 'CONNECTED' },
            ],
          }),
        },
      },
      {
        provide: DataMartTableReferenceService,
        useValue: {
          resolveTableName: async () => '`test.dataset.data`',
          ensureSqlViewIsUpToDate: async () => '`test.dataset.data`',
        },
      },
      {
        provide: SourceDataLastUpdatedService,
        useValue: {
          resolveForSql: async () => ({
            dataLastUpdatedAt: null,
            computedAt: '2026-10-20T00:00:00.000Z',
            coverage: 'unavailable',
            sources: [],
          }),
        },
      },
    ]);
    app = testApp.app;
    ({ dataMartId } = await setupPublishedDataMart(testApp.agent));
    runs = app.get<Repository<DataMartRun>>(getRepositoryToken(DataMartRun));

    // A real @modelcontextprotocol/client needs an actual listening address — supertest drives
    // the app in-process and can't be reused for a real HTTP client transport. MCP_PUBLIC_BASE_URL
    // is set only now, from the real assigned port: McpResourceResolverService compares against
    // `req.host`, which (confirmed empirically, this Express version) includes the port — so the
    // configured base URL has to match that shape exactly for the shared-resource identity check
    // to succeed. McpConfigService/McpResourceResolverService both read it live per request (a
    // getter over ConfigService, not cached at construction), so setting it post-listen is safe.
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    process.env.MCP_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
    baseUrl = new URL(`http://127.0.0.1:${address.port}/mcp`);
  });

  afterAll(async () => {
    if (app) {
      await closeTestApp(app);
    }
    if (originalMcpPublicBaseUrl === undefined) {
      delete process.env.MCP_PUBLIC_BASE_URL;
    } else {
      process.env.MCP_PUBLIC_BASE_URL = originalMcpPublicBaseUrl;
    }
    if (originalOwoxAuthPublicBaseUrl === undefined) {
      delete process.env.OWOX_AUTH_PUBLIC_BASE_URL;
    } else {
      process.env.OWOX_AUTH_PUBLIC_BASE_URL = originalOwoxAuthPublicBaseUrl;
    }
  });

  const connectClient = async (era: 'legacy' | 'modern' = 'legacy'): Promise<Client> => {
    const client = new Client(
      { name: 'e2e-test-client', version: '1.0.0' },
      era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined
    );
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: { token: async () => TEST_TOKEN } as never,
    });
    await client.connect(transport);
    expect(client.getProtocolEra()).toBe(era);
    return client;
  };

  it('serves protocol 2026-07-28 via server/discover and negotiates the modern era', async () => {
    const client = new Client(
      { name: 'e2e-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: { token: async () => TEST_TOKEN } as never,
    });

    await client.connect(transport);
    try {
      expect(client.getProtocolEra()).toBe('modern');

      const tools = await client.listTools();
      expect(Array.isArray(tools.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it('keeps serving a legacy (2025-era) client via the initialize handshake, unpinned', async () => {
    const client = await connectClient();
    try {
      expect(client.getProtocolEra()).toBe('legacy');

      const tools = await client.listTools();
      expect(Array.isArray(tools.tools)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('answers a standalone GET (legacy server-initiated SSE probe) with 405, pinning the onTransportError log-severity heuristic', async () => {
    // McpHttpEntryService.isExpectedStandaloneSseRejection assumes a legacy client's standalone GET
    // (opening a server-initiated stream outside a request/response) comes back as exactly GET+405
    // under the new SDK, the same signature the deleted transport handler used to generate itself —
    // pinning it here so a future SDK bump that changes this status silently breaks that assumption
    // via a real test failure instead of quietly turning expected-probe logs into WARN noise.
    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        accept: 'text/event-stream',
      },
    });

    expect(response.status).toBe(405);
  });

  it('rejects a token for the wrong resource scope (still real auth, not just a stub pass-through)', async () => {
    const client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: { token: async () => 'not-the-test-token' } as never,
    });

    await expect(client.connect(transport)).rejects.toThrow();
  });

  it('returns an actionable 401 on the next request when a connected user loses project access', async () => {
    const client = await connectClient();
    try {
      await expect(client.listTools()).resolves.toEqual(
        expect.objectContaining({ tools: expect.any(Array) })
      );
      hasProjectAccess = false;

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: expect.stringMatching(/check your project access.*administrator.*reconnect/),
      });
      expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"');
      expect(response.headers.get('www-authenticate')).toContain(
        `error_description="${body.message}"`
      );
      expect(response.headers.get('www-authenticate')).toContain(
        `resource_metadata="${baseUrl.origin}/.well-known/oauth-protected-resource"`
      );
      await expect(client.listTools()).rejects.toThrow();
    } finally {
      hasProjectAccess = true;
      await client.close();
    }
  });

  describe.each(['legacy', 'modern'] as const)('query_data_mart run history (%s)', era => {
    beforeAll(async () => {
      const client = await connectClient(era);
      try {
        const details = await client.callTool({
          name: 'get_data_mart_details_by_id',
          arguments: { data_mart_id: dataMartId },
        });
        expect(details.isError).toBeFalsy();
        expect(details.structuredContent).toMatchObject({
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'date', type: 'DATE' }),
            expect.objectContaining({ name: 'revenue', type: 'NUMERIC' }),
          ]),
        });
      } finally {
        await client.close();
      }
    });

    const invalidQueries: Array<{
      name: string;
      args: Partial<QueryDataMartInput>;
      errorCode: string;
    }> = [
      { name: 'unknown selected field', args: { fields: ['ghost'] }, errorCode: 'field_not_found' },
      {
        name: 'unknown filter field',
        args: { filters: [{ field: 'ghost', operator: 'eq', value: 'x' }] },
        errorCode: 'field_not_found',
      },
      {
        name: 'unknown sort field',
        args: { sort: [{ field: 'ghost', direction: 'asc' }] },
        errorCode: 'field_not_found',
      },
      {
        name: 'aggregation incompatible with the field type',
        args: { aggregations: [{ field: 'date', function: 'SUM' }] },
        errorCode: 'aggregation_not_allowed',
      },
      {
        name: 'date bucket on a numeric field',
        args: { fields: ['revenue'], date_buckets: [{ field: 'revenue', unit: 'MONTH' }] },
        errorCode: 'invalid_date_bucket',
      },
      {
        name: 'filter operator incompatible with the field type',
        args: { filters: [{ field: 'revenue', operator: 'contains', value: 'x' }] },
        errorCode: 'invalid_operator',
      },
      {
        name: 'invalid filter value',
        args: { filters: [{ field: 'date', operator: 'between', value: 'x' }] },
        errorCode: 'invalid_filter_value',
      },
    ];

    it.each(invalidQueries)(
      'returns a tool error and creates no run for $name',
      async ({ args, errorCode }) => {
        const countBefore = await runs.countBy({ dataMartId });
        const client = await connectClient(era);
        try {
          const result = await client.callTool({
            name: 'query_data_mart',
            arguments: { data_mart_id: dataMartId, fields: ['date'], limit: 10, ...args },
          });

          expect(result.isError).toBe(true);
          expect(result.structuredContent).toMatchObject({ error_code: errorCode });
          expect(await runs.countBy({ dataMartId })).toBe(countBefore);
        } finally {
          await client.close();
        }
      }
    );

    it.each([{ fields: [] }, { limit: 0 }, { limit: 1001 }])(
      'creates no run when the SDK rejects malformed arguments: %j',
      async args => {
        const countBefore = await runs.countBy({ dataMartId });
        const client = await connectClient(era);
        try {
          const result = await client.callTool({
            name: 'query_data_mart',
            arguments: { data_mart_id: dataMartId, fields: ['date'], limit: 10, ...args },
          });

          expect(result.isError).toBe(true);
          expect(result.content).toEqual([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Input validation error'),
            }),
          ]);
          expect(await runs.countBy({ dataMartId })).toBe(countBefore);
        } finally {
          await client.close();
        }
      }
    );

    it('returns rows and persists exactly one MCP_QUERY run for a valid query', async () => {
      const before = await runs.findBy({ dataMartId });
      const client = await connectClient(era);
      try {
        const result = await client.callTool({
          name: 'query_data_mart',
          arguments: { data_mart_id: dataMartId, fields: ['date'], limit: 10 },
        });

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          columns: ['date'],
          returned_rows: 1,
          rows: 'date\n2026-10-20',
          source: { data_mart: { id: dataMartId } },
        });
        const after = await runs.findBy({ dataMartId });
        const created = after.filter(run => !before.some(existing => existing.id === run.id));
        expect(created).toEqual([
          expect.objectContaining({
            type: DataMartRunType.MCP_QUERY,
            status: DataMartRunStatus.SUCCESS,
            createdById: '0',
          }),
        ]);
      } finally {
        await client.close();
      }
    });
  });
});
