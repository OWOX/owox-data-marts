import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators';
import { ProjectMembersController } from './project-members.controller';

jest.mock('../../idp', () => ({
  ...jest.requireActual('../../idp/decorators'),
  ...jest.requireActual('../../idp/types'),
}));

describe('ProjectMembersController', () => {
  it.each([
    'list',
    'invite',
    'getProvisioningSettings',
    'updateProvisioningSettings',
    'update',
    'remove',
    'listRequests',
    'approveRequest',
    'declineRequest',
  ] as const)('rejects API-key authentication for %s', methodName => {
    expect(
      Reflect.getMetadata(
        REJECT_API_KEY_AUTH_METADATA,
        ProjectMembersController.prototype[methodName]
      )
    ).toBe(true);
  });
});
