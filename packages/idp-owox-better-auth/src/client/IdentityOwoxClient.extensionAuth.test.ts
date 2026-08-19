import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpMock = {
  get: jest.fn(),
  post: jest.fn(),
};
const axiosCreateMock = jest.fn(() => httpMock);
const axiosIsAxiosErrorMock = jest.fn(() => false);
const getIdTokenMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: {
    create: axiosCreateMock,
    isAxiosError: axiosIsAxiosErrorMock,
  },
}));

jest.unstable_mockModule('@owox/internal-helpers', () => ({
  createMailingProvider: jest.fn(),
  disableConditionalCaching: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: getIdTokenMock,
  })),
  LogLevel: { ERROR: 'error', WARN: 'warn', INFO: 'info', DEBUG: 'debug' },
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

const projectToken = {
  accessToken: 'project-access-token',
  refreshToken: 'project-refresh-token',
  tokenType: 'Bearer',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('IdentityOwoxClient extension auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axiosIsAxiosErrorMock.mockReturnValue(false);
    getIdTokenMock.mockResolvedValue('c2c-id-token');
  });

  it('issues a direct project token through the exact C2C contract', async () => {
    httpMock.post.mockResolvedValue({
      data: { mode: 'project_token', projectToken },
    });

    await expect(
      createClient().issueExtensionSession({ userId: 'user-1', projectId: 'project-1' })
    ).resolves.toEqual({ mode: 'project_token', projectToken });
    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/extension/session',
      { userId: 'user-1', projectId: 'project-1' },
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it('rotates identity-session refresh tokens through the C2C endpoint', async () => {
    const identitySession = {
      ...projectToken,
      sessionId: 'session-1',
      sessionExpiresAt: '2026-08-19T12:00:00.000Z',
    };
    httpMock.post.mockResolvedValue({ data: identitySession });

    await expect(
      createClient().refreshExtensionSession({ refreshToken: 'identity-refresh-token' })
    ).resolves.toEqual(identitySession);
    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/extension/session/refresh',
      { refreshToken: 'identity-refresh-token' },
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it('lists projects and exchanges only the explicitly selected project', async () => {
    const client = createClient();
    httpMock.post
      .mockResolvedValueOnce({
        data: [{ id: 'project-1', title: 'One', roles: ['viewer'] }],
      })
      .mockResolvedValueOnce({ data: projectToken });

    await expect(
      client.getExtensionSessionProjects({ accessToken: 'identity-access-token' })
    ).resolves.toEqual([{ id: 'project-1', title: 'One', roles: ['viewer'] }]);
    await expect(
      client.exchangeExtensionSessionProjectToken({
        accessToken: 'identity-access-token',
        projectId: 'project-1',
      })
    ).resolves.toEqual(projectToken);
    expect(httpMock.post).toHaveBeenNthCalledWith(
      2,
      '/internal/idp/auth-flow/extension/session/project-token',
      { accessToken: 'identity-access-token', projectId: 'project-1' },
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it('revokes an identity-session family through C2C', async () => {
    httpMock.post.mockResolvedValue({ status: 204 });

    await createClient().revokeExtensionSession({ refreshToken: 'identity-refresh-token' });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/extension/session/revoke',
      { refreshToken: 'identity-refresh-token' },
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it('revokes only the supplied extension project refresh token through C2C', async () => {
    httpMock.post.mockResolvedValue({ status: 204 });

    await createClient().revokeExtensionProjectToken({
      refreshToken: 'project-refresh-token',
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/extension/project-token/revoke',
      { refreshToken: 'project-refresh-token' },
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it('propagates project-token revoke 5xx failures', async () => {
    axiosIsAxiosErrorMock.mockReturnValueOnce(true);
    httpMock.post.mockRejectedValue({
      response: { status: 503, data: { error: 'unavailable' } },
    });

    await expect(
      createClient().revokeExtensionProjectToken({ refreshToken: 'project-refresh-token' })
    ).rejects.toMatchObject({ status: 503 });
  });
});
