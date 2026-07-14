import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { closeTestApp, createTestApp } from '@owox/test-utils';

describe('MCP OAuth discovery (e2e)', () => {
  let app: INestApplication | undefined;
  let agent: supertest.Agent;
  const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;
  const originalOwoxAuthPublicBaseUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;
  const originalOpenaiAppsChallengeToken = process.env.MCP_OPENAI_APPS_CHALLENGE_TOKEN;
  const challengeToken = 'test-openai-apps-challenge-token';
  const getMcpMetadata = (path: string, host = 'mcp.owox.com') =>
    agent.get(path).set('Host', host).set('X-Forwarded-Proto', 'https');

  beforeAll(async () => {
    process.env.MCP_PUBLIC_BASE_URL = 'https://mcp.owox.com';
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    process.env.MCP_OPENAI_APPS_CHALLENGE_TOKEN = challengeToken;
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
    if (originalOpenaiAppsChallengeToken === undefined) {
      delete process.env.MCP_OPENAI_APPS_CHALLENGE_TOKEN;
    } else {
      process.env.MCP_OPENAI_APPS_CHALLENGE_TOKEN = originalOpenaiAppsChallengeToken;
    }
  });

  it('publishes OAuth protected-resource metadata at root well-known path', async () => {
    const response = await getMcpMetadata('/.well-known/oauth-protected-resource');

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
      const response = await getMcpMetadata(path);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        resource: 'https://mcp.owox.com/mcp',
        authorization_servers: ['https://app.owox.com'],
        scopes_supported: ['mcp:read', 'mcp:write'],
      });
    }
  });

  it('keeps the project host as the authorization server for dynamic registration', async () => {
    const projectHost = '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com';
    const response = await getMcpMetadata('/.well-known/oauth-protected-resource', projectHost);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      resource: `https://${projectHost}/mcp`,
      authorization_servers: [`https://${projectHost}`],
      scopes_supported: ['mcp:read', 'mcp:write'],
    });
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

  it('serves the OpenAI Apps domain-verification challenge token as text/plain at the origin-root well-known path', async () => {
    const response = await agent.get('/.well-known/openai-apps-challenge');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toBe(challengeToken);
  });

  it('does not expose the OpenAI Apps challenge under the /api prefix', async () => {
    const response = await agent.get('/api/.well-known/openai-apps-challenge');

    expect(response.status).toBe(404);
  });

  it('challenges unauthenticated MCP requests with protected resource metadata', async () => {
    const response = await agent.post('/mcp').send({ jsonrpc: '2.0', method: 'initialize' });

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
  });
});
