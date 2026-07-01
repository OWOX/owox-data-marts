import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpMock = {
  get: jest.fn(),
  post: jest.fn(),
};
const axiosCreateMock = jest.fn(() => httpMock);
const getIdTokenMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: {
    create: axiosCreateMock,
    isAxiosError: jest.fn(() => false),
  },
}));

jest.unstable_mockModule('@owox/internal-helpers', () => ({
  createMailingProvider: jest.fn(),
  disableConditionalCaching: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: getIdTokenMock,
  })),
  LogLevel: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
  },
  LoggerFactory: {
    createNamedLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    })),
  },
  parseMysqlSslEnv: jest.fn(),
  sendSecureHtml: jest.fn(),
}));

const { IdentityOwoxClient } = await import('./IdentityOwoxClient.js');

function createClient() {
  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout: '3s',
    clientBackchannelPrefix: '/internal/',
    c2cServiceAccountEmail: 'service@example.iam.gserviceaccount.com',
    c2cTargetAudience: 'https://idp.example.com/internal',
  });
}

describe('IdentityOwoxClient MCP OAuth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIdTokenMock.mockResolvedValue('id-token');
  });

  it('creates MCP authorization code through C2C backchannel', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        code: 'mcp-code',
        clientId: 'mcp-client',
        redirectUri: 'http://127.0.0.1:1455/callback',
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        expiresAt: '2026-06-10T10:00:00.000Z',
      },
    });

    const result = await createClient().createMcpOAuthAuthorizationCode({
      request: {
        clientId: 'mcp-client',
        redirectUri: 'http://127.0.0.1:1455/callback',
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        state: 'state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      },
      projectMember: {
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
      },
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/oauth/authorization-code',
      expect.objectContaining({
        request: expect.objectContaining({ clientId: 'mcp-client' }),
        projectMember: expect.objectContaining({ projectId: 'project-1' }),
      }),
      { headers: { Authorization: 'Bearer id-token' } }
    );
    expect(result.code).toBe('mcp-code');
  });

  it('exchanges MCP OAuth code through C2C backchannel', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        access_token: 'mcp-access-token',
        refresh_token: 'mcp-refresh-token',
        token_type: 'Bearer',
        expires_in: 900,
        scope: 'mcp:read',
      },
    });

    const result = await createClient().exchangeMcpOAuthToken({
      grantType: 'authorization_code',
      code: 'mcp-code',
      clientId: 'mcp-client',
      redirectUri: 'http://127.0.0.1:1455/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/oauth/token',
      expect.objectContaining({ grantType: 'authorization_code', code: 'mcp-code' }),
      { headers: { Authorization: 'Bearer id-token' } }
    );
    expect(result.access_token).toBe('mcp-access-token');
  });

  it('verifies MCP access token through C2C backchannel', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        active: true,
        payload: {
          clientId: 'mcp-client',
          userId: 'user-1',
          projectId: 'project-1',
          roles: ['viewer'],
          resource: 'https://mcp.owox.com/mcp',
          scopes: ['mcp:read'],
          authFlow: 'mcp',
        },
      },
    });

    const result = await createClient().verifyMcpAccessToken({
      token: 'access-token',
      resource: 'https://mcp.owox.com/mcp',
      requiredScopes: ['mcp:read'],
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/oauth/token/verify',
      {
        token: 'access-token',
        resource: 'https://mcp.owox.com/mcp',
        requiredScopes: ['mcp:read'],
      },
      { headers: { Authorization: 'Bearer id-token' } }
    );
    expect(result?.projectId).toBe('project-1');
    expect(result?.clientId).toBe('mcp-client');
  });

  it('verifies an MCP access token whose payload has a null avatar', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        active: true,
        payload: {
          clientId: 'mcp-client',
          userId: 'user-1',
          projectId: 'project-1',
          roles: ['viewer'],
          avatar: null,
          resource: 'https://mcp.owox.com/mcp',
          scopes: ['mcp:read'],
          authFlow: 'mcp',
        },
      },
    });

    const result = await createClient().verifyMcpAccessToken({
      token: 'access-token',
      resource: 'https://mcp.owox.com/mcp',
      requiredScopes: ['mcp:read'],
    });

    expect(result?.projectId).toBe('project-1');
    expect(result?.avatar).toBeUndefined();
  });

  it('gets one project for a user through C2C backchannel', async () => {
    httpMock.get.mockResolvedValue({
      data: {
        id: 'project-1',
        title: 'Main Project',
        status: 'active',
        roles: ['admin'],
        createdAt: '2026-06-01 12:30:45',
      },
    });

    const result = await createClient().getProjectForUser('user-1', 'project-1');

    expect(httpMock.get).toHaveBeenCalledWith('/internal/idp/users/user-1/projects/project-1', {
      headers: { Authorization: 'Bearer id-token' },
    });
    expect(result).toEqual({
      id: 'project-1',
      title: 'Main Project',
      status: 'active',
      roles: ['admin'],
      createdAt: '2026-06-01 12:30:45',
    });
  });
});
