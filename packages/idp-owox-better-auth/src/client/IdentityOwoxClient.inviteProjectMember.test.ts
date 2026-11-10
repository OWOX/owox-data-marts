import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const httpMock = {
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
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

function createClient(clientTimeout: '3s' | '20s' = '3s') {
  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout,
    clientBackchannelPrefix: '/internal',
    c2cServiceAccountEmail: 'service@example.iam.gserviceaccount.com',
    c2cTargetAudience: 'https://idp.example.com/internal',
  });
}

describe('IdentityOwoxClient.inviteProjectMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIdTokenMock.mockResolvedValue('id-token');
    httpMock.post.mockResolvedValue({ data: { userUid: 'new-user-uid' } });
  });

  it('waits longer than the default timeout, since the Identity API waits for the legacy invite', async () => {
    const actual = await createClient('3s').inviteProjectMember(
      'project-1',
      'new@example.com',
      'editor',
      'admin-1'
    );

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/bi-project/project-1/members',
      { biUserId: 'admin-1', inviteeEmail: 'new@example.com', role: 'editor' },
      { headers: { Authorization: 'Bearer id-token' }, timeout: 10000 }
    );
    expect(actual).toEqual({ userUid: 'new-user-uid' });
  });

  it('keeps a configured timeout that is already longer', async () => {
    await createClient('20s').inviteProjectMember(
      'project-1',
      'new@example.com',
      'editor',
      'admin-1'
    );

    expect(httpMock.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ timeout: 20000 })
    );
  });
});
