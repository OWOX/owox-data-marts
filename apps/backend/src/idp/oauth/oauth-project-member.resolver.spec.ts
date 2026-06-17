import { UnauthorizedException } from '@nestjs/common';
import { OAuthProjectMemberResolver } from './oauth-project-member.resolver';
import type { AuthorizationContext } from '../types';

describe('OAuthProjectMemberResolver', () => {
  it('maps signed-in ODM context to MCP project-member context', () => {
    const resolver = new OAuthProjectMemberResolver();

    const result = resolver.resolve({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      email: 'user@example.com',
      fullName: 'User One',
      avatar: 'https://example.com/avatar.png',
    } as AuthorizationContext);

    expect(result).toEqual({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      email: 'user@example.com',
      fullName: 'User One',
      avatar: 'https://example.com/avatar.png',
    });
  });

  it('rejects missing roles', () => {
    const resolver = new OAuthProjectMemberResolver();

    expect(() =>
      resolver.resolve({
        userId: 'user-1',
        projectId: 'project-1',
        roles: [],
      } as AuthorizationContext)
    ).toThrow(UnauthorizedException);
  });
});
