import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/idp.guard';
import { getAuthorizationContext } from './auth-context.decorator';

describe('getAuthorizationContext', () => {
  it('propagates API-key metadata from the authenticated request', () => {
    const request = {
      idpContext: {
        projectId: 'project-1',
        userId: 'user-1',
        fullName: 'User Name',
        avatar: 'https://example.com/avatar.png',
        email: 'user@example.com',
        roles: ['viewer'],
        projectTitle: 'Project One',
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
    } as AuthenticatedRequest;

    expect(getAuthorizationContext(request)).toEqual({
      projectId: 'project-1',
      userId: 'user-1',
      fullName: 'User Name',
      avatar: 'https://example.com/avatar.png',
      email: 'user@example.com',
      roles: ['viewer'],
      projectTitle: 'Project One',
      authFlow: 'api_key',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });
  });

  it('throws when the request has no IDP context', () => {
    expect(() => getAuthorizationContext({} as AuthenticatedRequest)).toThrow(BadRequestException);
  });
});
