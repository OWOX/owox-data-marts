import { describe, expect, it } from '@jest/globals';
import {
  McpOAuthProjectMemberContextSchema,
  McpTokenPayloadSchema,
  OAuthAuthorizationServerMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
  OAuthTokenExchangeResultSchema,
} from './oauth.js';

describe('MCP OAuth protocol schemas', () => {
  it('accepts protected-resource metadata for the MCP resource', () => {
    const result = OAuthProtectedResourceMetadataSchema.parse({
      resource: 'https://mcp.owox.com/mcp',
      authorization_servers: ['https://app.owox.com'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      resource_documentation: 'https://docs.owox.com/docs/mcp',
    });

    expect(result.resource).toBe('https://mcp.owox.com/mcp');
    expect(result.authorization_servers).toEqual(['https://app.owox.com']);
  });

  it('accepts authorization-code metadata with PKCE and dynamic registration', () => {
    const result = OAuthAuthorizationServerMetadataSchema.parse({
      issuer: 'https://app.owox.com',
      authorization_endpoint: 'https://app.owox.com/oauth/authorize',
      token_endpoint: 'https://app.owox.com/oauth/token',
      registration_endpoint: 'https://app.owox.com/oauth/register',
      jwks_uri: 'https://app.owox.com/oauth/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp:read', 'mcp:write'],
      token_endpoint_auth_methods_supported: ['none'],
    });

    expect(result.response_types_supported).toEqual(['code']);
    expect(result.code_challenge_methods_supported).toEqual(['S256']);
    expect(result.token_endpoint_auth_methods_supported).toEqual(['none']);
  });

  it('requires project-member scoped MCP token claims', () => {
    const payload = McpTokenPayloadSchema.parse({
      clientId: 'mcp-client-1',
      userId: 'user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      roles: ['viewer'],
      resource: 'https://mcp.owox.com/mcp',
      scopes: ['mcp:read'],
      authFlow: 'mcp',
    });

    expect(payload).toEqual(
      expect.objectContaining({
        clientId: 'mcp-client-1',
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['viewer'],
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        authFlow: 'mcp',
      })
    );

    expect(() =>
      McpTokenPayloadSchema.parse({
        clientId: 'mcp-client-1',
        userId: 'user-1',
        roles: ['viewer'],
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
      })
    ).toThrow();

    expect(() =>
      McpTokenPayloadSchema.parse({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['viewer'],
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        authFlow: 'mcp',
      })
    ).toThrow();
  });

  it('requires project-member context before issuing an authorization code', () => {
    const context = McpOAuthProjectMemberContextSchema.parse({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['editor'],
      email: 'user@example.com',
    });

    expect(context).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['editor'],
      })
    );
  });

  it('maps token exchange response without IB transport fields', () => {
    const result = OAuthTokenExchangeResultSchema.parse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'mcp:read',
    });

    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'mcp:read',
    });
  });
});
