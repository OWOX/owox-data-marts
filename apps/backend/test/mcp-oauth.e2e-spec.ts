import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { closeTestApp, createTestApp } from '@owox/test-utils';

describe('MCP OAuth discovery (e2e)', () => {
  let app: INestApplication | undefined;
  let agent: supertest.Agent;
  const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;
  const originalOwoxAuthPublicBaseUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;

  beforeAll(async () => {
    process.env.MCP_PUBLIC_BASE_URL = 'https://mcp.owox.com';
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
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

  it('publishes OAuth protected-resource metadata at root well-known path', async () => {
    const response = await agent.get('/.well-known/oauth-protected-resource');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      resource: 'https://mcp.owox.com/mcp',
      authorization_servers: ['https://app.owox.com'],
      scopes_supported: ['mcp:read', 'mcp:write'],
    });
  });

  it('publishes OAuth protected-resource metadata at MCP-scoped well-known paths', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/mcp/.well-known/oauth-protected-resource',
    ]) {
      const response = await agent.get(path);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        resource: 'https://mcp.owox.com/mcp',
        authorization_servers: ['https://app.owox.com'],
        scopes_supported: ['mcp:read', 'mcp:write'],
      });
    }
  });

  it('publishes OAuth authorization-server metadata at root well-known path', async () => {
    const response = await agent.get('/.well-known/oauth-authorization-server');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      issuer: 'https://app.owox.com',
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: 'https://app.owox.com/oauth/token',
      registration_endpoint: 'https://app.owox.com/oauth/register',
    });
  });

  it('publishes OAuth authorization-server metadata at MCP-scoped well-known paths', async () => {
    for (const path of [
      '/.well-known/oauth-authorization-server/mcp',
      '/mcp/.well-known/oauth-authorization-server',
    ]) {
      const response = await agent.get(path);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        issuer: 'https://app.owox.com',
        authorization_endpoint: 'https://app.owox.com/oauth/authorize',
        token_endpoint: 'https://app.owox.com/oauth/token',
        registration_endpoint: 'https://app.owox.com/oauth/register',
      });
    }
  });

  it('challenges unauthenticated MCP requests with protected resource metadata', async () => {
    const response = await agent.post('/mcp').send({ jsonrpc: '2.0', method: 'initialize' });

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
  });
});
