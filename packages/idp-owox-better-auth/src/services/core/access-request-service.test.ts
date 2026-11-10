import { describe, expect, it, jest } from '@jest/globals';
import type { IdentityOwoxClient } from '../../client/index.js';
import type {
  OwoxProjectMembersResponse,
  OwoxRequestProjectAccessResponse,
  OwoxUserProvisioningRequestAccessContextResponse,
} from '../../client/dto/index.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';
import { AccessRequestService, type AccessRequestNotification } from './access-request-service.js';

type Member = OwoxProjectMembersResponse['projectMembers'][number];

function member(overrides: Partial<Member>): Member {
  return {
    userId: 1,
    userStatus: 'active',
    fullName: '',
    email: 'admin@example.com',
    projectRole: 'admin',
    ...overrides,
  };
}

const ACCESS_RESPONSE: OwoxRequestProjectAccessResponse = {
  user: { userUid: 'user-1' },
  project: { projectName: 'p-1', projectTitle: 'Acme' },
  request: { role: 'editor', status: 'processing' },
};

function accessContext(
  existingRequest: OwoxUserProvisioningRequestAccessContextResponse['existingRequest']
): OwoxUserProvisioningRequestAccessContextResponse {
  return {
    decision: 'request_access',
    user: { userUid: 'user-1', email: 'identity@example.com' },
    organization: null,
    project: { projectName: 'p-1', projectTitle: 'Acme' },
    availableRoles: ['viewer', 'editor'],
    defaultRole: 'viewer',
    existingRequest,
  };
}

function setup(members: Member[] = [member({})], options = { pendingRequestCheckTimeoutMs: 50 }) {
  const identityClient = {
    getUserProvisioningRequestAccessContext: jest.fn(async () => accessContext(null)),
    requestProjectAccess: jest.fn(async () => ACCESS_RESPONSE),
    getProjectMembers: jest.fn(async () => ({
      project: { projectId: 'p-1', projectTitle: 'Acme' },
      projectMembers: members,
    })),
  };
  const store = {
    getUserByBiUserId: jest.fn(async () => ({ id: 'u', email: 'new@example.com' })),
  };
  const emailService = { send: jest.fn(async () => undefined) };
  const service = new AccessRequestService(
    store as unknown as DatabaseStore,
    identityClient as unknown as IdentityOwoxClient,
    emailService as unknown as AccessRequestEmailService,
    options
  );
  return { identityClient, store, emailService, service };
}

const NOTIFICATION: AccessRequestNotification = {
  projectId: 'p-1',
  projectTitle: 'Acme',
  requesterUserId: 'user-1',
  role: 'editor',
};

describe('AccessRequestService.requestAccess', () => {
  it('returns the Identity request and emails the admins about a new request', async () => {
    const { identityClient, service } = setup();
    const notify = jest.spyOn(service, 'notifyAdmins').mockResolvedValue(undefined);

    const result = await service.requestAccess('user-1', 'p-1', 'editor');

    expect(identityClient.requestProjectAccess).toHaveBeenCalledWith('user-1', 'p-1', 'editor');
    expect(result).toEqual({
      userId: 'user-1',
      projectId: 'p-1',
      projectTitle: 'Acme',
      request: { role: 'editor', status: 'processing' },
    });
    expect(notify).toHaveBeenCalledWith({
      projectId: 'p-1',
      projectTitle: 'Acme',
      requesterUserId: 'user-1',
      requesterEmail: 'identity@example.com',
      role: 'editor',
    });
  });

  it('does not email the admins again while the same request is pending', async () => {
    const { identityClient, service } = setup();
    identityClient.getUserProvisioningRequestAccessContext.mockResolvedValue(
      accessContext({ role: 'editor', status: 'processing' })
    );
    const notify = jest.spyOn(service, 'notifyAdmins').mockResolvedValue(undefined);

    await service.requestAccess('user-1', 'p-1', 'editor');

    expect(identityClient.requestProjectAccess).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats the request as new when the pending-request check fails or is slow', async () => {
    const { identityClient, service } = setup();
    const notify = jest.spyOn(service, 'notifyAdmins').mockResolvedValue(undefined);

    identityClient.getUserProvisioningRequestAccessContext.mockRejectedValueOnce(
      new Error('Identity unavailable')
    );
    await service.requestAccess('user-1', 'p-1', 'editor');

    identityClient.getUserProvisioningRequestAccessContext.mockImplementationOnce(
      () => new Promise(() => undefined)
    );
    await service.requestAccess('user-1', 'p-1', 'editor');

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[0]?.[0].requesterEmail).toBeUndefined();
  });

  it('does not wait for the emails', async () => {
    const { service } = setup();
    jest.spyOn(service, 'notifyAdmins').mockReturnValue(new Promise(() => undefined));

    await expect(service.requestAccess('user-1', 'p-1', 'editor')).resolves.toMatchObject({
      projectId: 'p-1',
    });
  });

  it('emails nobody when Identity rejects the request', async () => {
    const { identityClient, service } = setup();
    identityClient.requestProjectAccess.mockRejectedValue(new Error('Forbidden'));
    const notify = jest.spyOn(service, 'notifyAdmins').mockResolvedValue(undefined);

    await expect(service.requestAccess('user-1', 'p-1', 'editor')).rejects.toThrow('Forbidden');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('AccessRequestService.notifyAdmins', () => {
  it('emails every active admin once, whatever their notification settings', async () => {
    const { emailService, service } = setup([
      member({ userId: 1, email: 'first@example.com' }),
      member({ userId: 2, email: 'First@Example.com' }),
      member({
        userId: 3,
        email: 'muted@example.com',
        subscriptions: {
          serviceNotifications: false,
          performanceSuggestions: false,
          offers: false,
        },
      }),
      member({ userId: 4, email: 'editor@example.com', projectRole: 'editor' }),
      member({ userId: 5, email: 'locked@example.com', userStatus: 'locked' }),
      member({ userId: 6, email: ' ' }),
    ]);

    await service.notifyAdmins(NOTIFICATION);

    expect(emailService.send.mock.calls.map(([payload]) => payload)).toEqual([
      {
        adminEmail: 'first@example.com',
        requesterEmail: 'new@example.com',
        role: 'editor',
        projectId: 'p-1',
        projectTitle: 'Acme',
      },
      {
        adminEmail: 'muted@example.com',
        requesterEmail: 'new@example.com',
        role: 'editor',
        projectId: 'p-1',
        projectTitle: 'Acme',
      },
    ]);
  });

  it('reads the admins from Identity, not from the members cache', async () => {
    const { identityClient, service } = setup();

    await service.notifyAdmins(NOTIFICATION);

    expect(identityClient.getProjectMembers).toHaveBeenCalledWith('p-1');
  });

  it('falls back to the requester email from Identity', async () => {
    const { store, emailService, service } = setup();
    store.getUserByBiUserId.mockResolvedValue(null as never);

    await service.notifyAdmins({ ...NOTIFICATION, requesterEmail: 'identity@example.com' });

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ requesterEmail: 'identity@example.com' })
    );
  });

  it('keeps emailing the other admins when one email fails, and never throws', async () => {
    const { emailService, service } = setup([
      member({ userId: 1, email: 'first@example.com' }),
      member({ userId: 2, email: 'second@example.com' }),
    ]);
    emailService.send.mockRejectedValueOnce(new Error('SendGrid responded 500'));

    await expect(service.notifyAdmins(NOTIFICATION)).resolves.toBeUndefined();
    expect(emailService.send).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the admins cannot be loaded', async () => {
    const { identityClient, emailService, service } = setup();
    identityClient.getProjectMembers.mockRejectedValue(new Error('Identity unavailable'));

    await expect(service.notifyAdmins(NOTIFICATION)).resolves.toBeUndefined();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
