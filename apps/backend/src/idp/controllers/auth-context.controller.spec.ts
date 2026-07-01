import { AuthContextController } from './auth-context.controller';
import { Strategy } from '../types';

describe('AuthContextController', () => {
  const controller = new AuthContextController();

  it('uses token introspection so the returned context is current', () => {
    const getMetadata = (Reflect as unknown as {
      getMetadata(key: string, target: unknown): unknown;
    }).getMetadata;

    expect(getMetadata('roleConfig', AuthContextController.prototype.getContext)).toEqual({
      role: 'viewer',
      strategy: Strategy.INTROSPECT,
    });
  });

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
