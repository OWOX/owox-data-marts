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

  it('tells the caller when an emailed invitation could not be delivered', async () => {
    const inviteProjectMember = {
      run: jest.fn().mockResolvedValue({
        projectId: 'project-1',
        email: 'new@example.com',
        role: 'editor',
        kind: 'email-sent',
        userId: 'user-2',
        emailSent: false,
        message: 'new@example.com was invited, but the invitation email could not be sent.',
      }),
    };
    const unused = {} as never;
    const controller = new ProjectMembersController(
      unused,
      inviteProjectMember as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused
    );

    const response = await controller.invite(
      { projectId: 'project-1', userId: 'admin-1' } as never,
      { email: 'new@example.com', role: 'editor' } as never
    );

    expect(response).toEqual({
      email: 'new@example.com',
      role: 'editor',
      kind: 'email-sent',
      userId: 'user-2',
      emailSent: false,
      message: 'new@example.com was invited, but the invitation email could not be sent.',
    });
  });
});
