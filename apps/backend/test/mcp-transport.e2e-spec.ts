import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import { MCP_AUTH_PORT } from '../src/ee/mcp/auth/mcp-auth.port';
import type { McpAuthPort } from '../src/ee/mcp/auth/mcp-auth.port';

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
  const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;
  const originalOwoxAuthPublicBaseUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;
  const TEST_TOKEN = 'e2e-mcp-token';
  let hasProjectAccess = true;

  const fakeAuthPort: McpAuthPort = {
    verifyToken: async (token, resource, requiredScopes) => {
      if (token !== TEST_TOKEN || !hasProjectAccess) return null;
      return {
        clientId: 'e2e-client',
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
        resource,
        scopes: requiredScopes.length ? requiredScopes : ['mcp:read', 'mcp:write'],
        authFlow: 'mcp',
      };
    },
  };

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';

    const testApp = await createTestApp([{ provide: MCP_AUTH_PORT, useValue: fakeAuthPort }]);
    app = testApp.app;

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

  const connectClient = async (): Promise<Client> => {
    const client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: { token: async () => TEST_TOKEN } as never,
    });
    await client.connect(transport);
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
});
