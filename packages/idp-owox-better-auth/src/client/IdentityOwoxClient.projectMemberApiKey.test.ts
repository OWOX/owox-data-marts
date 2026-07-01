import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpMock = {
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

function createClient(clientBackchannelPrefix = '/internal/') {
  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout: '3s',
    clientBackchannelPrefix,
    c2cServiceAccountEmail: 'service@example.iam.gserviceaccount.com',
    c2cTargetAudience: 'https://idp.example.com/internal',
  });
}

describe('IdentityOwoxClient project member API key auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIdTokenMock.mockResolvedValue('id-token');
    httpMock.post.mockResolvedValue({
      data: {
        accessToken: 'regular-odm-access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        accessTokenExpiresIn: 900,
        refreshTokenExpiresIn: 2592000,
      },
    });
  });

  it('requests token issuing through the normalized C2C backchannel without roles for inherited-role keys', async () => {
    const result = await createClient().issueAccessTokenForProjectMemberApiKey({
      projectId: 'project-1',
      userId: 'user-1',
      role: null,
      readOnly: false,
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });

    expect(getIdTokenMock).toHaveBeenCalledWith(
      'service@example.iam.gserviceaccount.com',
      'https://idp.example.com/internal'
    );
    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/project-member-api-key',
      {
        projectId: 'project-1',
        userId: 'user-1',
        readOnly: false,
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
      }
    );
    expect(result.accessToken).toBe('regular-odm-access-token');
  });

  it('sends exactly one role when the key has an explicit requested role', async () => {
    await createClient('/internal').issueAccessTokenForProjectMemberApiKey({
      projectId: 'project-1',
      userId: 'user-1',
      role: 'viewer',
      readOnly: true,
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/project-member-api-key',
      expect.objectContaining({
        roles: ['viewer'],
        readOnly: true,
      }),
      expect.any(Object)
    );
  });
});
