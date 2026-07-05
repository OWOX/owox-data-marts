import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators';
import { ProjectMembersController } from './project-members.controller';

jest.mock('../../idp', () => ({
  ...jest.requireActual('../../idp/decorators'),
  ...jest.requireActual('../../idp/types'),
}));

describe('ProjectMembersController', () => {
  it('rejects API-key authentication at the controller level', () => {
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, ProjectMembersController)).toBe(true);
  });
});
