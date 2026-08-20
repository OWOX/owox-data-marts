import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpMock = { get: jest.fn(), post: jest.fn() };
const axiosCreateMock = jest.fn(() => httpMock);
const axiosIsAxiosErrorMock = jest.fn(() => false);
const getIdTokenMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: { create: axiosCreateMock, isAxiosError: axiosIsAxiosErrorMock },
}));

jest.unstable_mockModule('@owox/internal-helpers', () => ({
  createMailingProvider: jest.fn(),
  disableConditionalCaching: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({ getIdToken: getIdTokenMock })),
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

const tokenResponse = {
  accessToken: 'project-access-token',
  refreshToken: 'project-refresh-token',
  tokenType: 'Bearer',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('IdentityOwoxClient Microsoft extension auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axiosIsAxiosErrorMock.mockReturnValue(false);
    getIdTokenMock.mockResolvedValue('c2c-id-token');
  });

  it('sends the verified identity to the exact C2C provisioning endpoint', async () => {
    httpMock.post.mockResolvedValue({ data: tokenResponse });
    const request = {
      oid: 'oid-1',
      tid: 'tid-1',
      email: 'user@example.com',
      firstName: 'User',
      lastName: 'Name',
      fullName: 'User Name',
      biProjectId: 'project-1',
    };

    await expect(createClient().exchangeMicrosoftExtensionIdentity(request)).resolves.toEqual(
      tokenResponse
    );
    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/auth-flow/extension/microsoft-identity',
      request,
      { headers: { Authorization: 'Bearer c2c-id-token' } }
    );
  });

  it.each([400, 401, 404])('treats revocation HTTP %s as already revoked', async status => {
    const error = { response: { status } };
    httpMock.post.mockRejectedValue(error);
    axiosIsAxiosErrorMock.mockImplementation(value => value === error);

    await expect(
      createClient().revokeToken({ token: 'refresh-token', tokenType: 'refresh_token' })
    ).resolves.toEqual({ success: true });
  });

  it.each([{ response: { status: 429 } }, { response: { status: 503 } }, {}])(
    'keeps revocation server and transport failures retryable',
    async error => {
      httpMock.post.mockRejectedValue(error);
      axiosIsAxiosErrorMock.mockImplementation(value => value === error);

      await expect(
        createClient().revokeToken({ token: 'refresh-token', tokenType: 'refresh_token' })
      ).resolves.toEqual({ success: false });
    }
  );
});
