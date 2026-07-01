import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IdpFailedException } from '../core/exceptions.js';

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

function createClient(clientBackchannelPrefix = '/internal') {
  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout: '3s',
    clientBackchannelPrefix,
    c2cServiceAccountEmail: 'service@example.iam.gserviceaccount.com',
    c2cTargetAudience: 'https://idp.example.com/internal',
  });
}

function createClientWithoutC2c() {
  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout: '3s',
    clientBackchannelPrefix: '/internal',
    c2cServiceAccountEmail: undefined,
    c2cTargetAudience: undefined,
  });
}

describe('IdentityOwoxClient user provisioning settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIdTokenMock.mockResolvedValue('id-token');
  });

  it('gets settings through the C2C backchannel with the actor user id query param', async () => {
    httpMock.get.mockResolvedValue({
      data: {
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'automatic',
          defaultRole: 'viewer',
        },
      },
    });

    const actual = await createClient().getUserProvisioningSettings('project-1', 'actor-1');

    expect(getIdTokenMock).toHaveBeenCalledWith(
      'service@example.iam.gserviceaccount.com',
      'https://idp.example.com/internal'
    );
    expect(httpMock.get).toHaveBeenCalledWith(
      '/internal/idp/bi-project/project-1/user-provisioning-settings',
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
        params: {
          biUserId: 'actor-1',
        },
      }
    );
    expect(actual.isApplicable).toBe(true);
    expect(actual.settings).toMatchObject({ defaultRole: 'viewer' });
  });

  it('normalizes a trailing slash in the C2C backchannel prefix for existing endpoints', async () => {
    httpMock.get.mockResolvedValue({
      data: {
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'automatic',
          defaultRole: 'viewer',
        },
      },
    });

    await createClient('/internal/').getUserProvisioningSettings('project-1', 'actor-1');

    expect(httpMock.get).toHaveBeenCalledWith(
      '/internal/idp/bi-project/project-1/user-provisioning-settings',
      expect.any(Object)
    );
  });

  it('updates settings through the C2C backchannel with the actor user id body field', async () => {
    httpMock.put.mockResolvedValue({
      data: {
        isApplicable: true,
        organization: {
          name: 'owox.com',
          mainProjectName: 'main-project',
          mainProjectTitle: 'Main Project',
        },
        settings: {
          mode: 'manual',
          defaultRole: 'editor',
        },
      },
    });

    const actual = await createClient().updateUserProvisioningSettings('project-1', 'actor-1', {
      mode: 'manual',
      defaultRole: 'editor',
    });

    expect(httpMock.put).toHaveBeenCalledWith(
      '/internal/idp/bi-project/project-1/user-provisioning-settings',
      {
        biUserId: 'actor-1',
        mode: 'manual',
        defaultRole: 'editor',
      },
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
      }
    );
    expect(actual.isApplicable).toBe(true);
    expect(actual.settings).toMatchObject({ mode: 'manual' });
  });

  it('fails fast when C2C is not configured', async () => {
    await expect(
      createClientWithoutC2c().getUserProvisioningSettings('project-1', 'actor-1')
    ).rejects.toBeInstanceOf(IdpFailedException);
  });

  it('gets request-access context through the C2C backchannel', async () => {
    httpMock.get.mockResolvedValue({
      data: {
        decision: 'request_access',
        user: {
          userUid: 'user-1',
          email: 'user@company.com',
        },
        organization: {
          name: 'company.com',
        },
        project: {
          projectName: 'main-project',
          projectTitle: 'Main Project',
        },
        availableRoles: ['viewer', 'editor', 'admin'],
        defaultRole: 'viewer',
        existingRequest: null,
      },
    });

    const actual = await createClient().getUserProvisioningRequestAccessContext(
      'user-1',
      'project-1'
    );

    expect(httpMock.get).toHaveBeenCalledWith(
      '/internal/idp/bi-project/project-1/user-provisioning/request-access-context',
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
        params: {
          biUserId: 'user-1',
        },
      }
    );
    expect(actual.decision).toBe('request_access');
    expect(actual.project.projectName).toBe('main-project');
  });

  it('requests project access through the C2C backchannel', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        user: {
          userUid: 'user-1',
        },
        project: {
          projectName: 'main-project',
          projectTitle: 'Main Project',
        },
        request: {
          role: 'viewer',
          status: 'processing',
        },
      },
    });

    const actual = await createClient().requestProjectAccess('user-1', 'main-project', 'viewer');

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/bi-project/main-project/user-provisioning/request-access',
      {
        biUserId: 'user-1',
        role: 'viewer',
      },
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
      }
    );
    expect(actual.request).toMatchObject({ role: 'viewer', status: 'processing' });
  });

  it('creates a new project through the C2C backchannel', async () => {
    httpMock.post.mockResolvedValue({
      data: {
        projectName: 'new-project',
        projectTitle: 'New Project',
      },
    });

    const actual = await createClient().createNewProject('user-1', 'extension-v2');

    expect(httpMock.post).toHaveBeenCalledWith(
      '/internal/idp/user-provisioning/create-new-project',
      {
        biUserId: 'user-1',
        integration: 'extension-v2',
      },
      {
        headers: {
          Authorization: 'Bearer id-token',
        },
      }
    );
    expect(actual.projectName).toBe('new-project');
  });
});
