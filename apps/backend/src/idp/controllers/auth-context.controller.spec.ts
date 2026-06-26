import { AuthContextController } from './auth-context.controller';

describe('AuthContextController', () => {
  const controller = new AuthContextController();

  it('returns API-key auth context without secrets', () => {
    expect(
      controller.getContext({
        userId: 'user-1',
        projectId: 'project-1',
        email: 'user@example.com',
        fullName: 'User Example',
        avatar: 'https://img.example.com/user.png',
        roles: ['viewer'],
        projectTitle: 'Demo Project',
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    ).toEqual({
      userId: 'user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      fullName: 'User Example',
      avatar: 'https://img.example.com/user.png',
      roles: ['viewer'],
      projectTitle: 'Demo Project',
      authFlow: 'api_key',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });
  });

  it('returns non-API-key auth context', () => {
    expect(
      controller.getContext({
        userId: 'user-1',
        projectId: 'project-1',
        email: 'user@example.com',
        fullName: 'User Example',
        roles: ['viewer'],
      })
    ).toEqual({
      userId: 'user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      fullName: 'User Example',
      avatar: undefined,
      roles: ['viewer'],
      projectTitle: undefined,
      authFlow: undefined,
      apiKeyId: undefined,
    });
  });
});
