import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Project } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { SetupAuthorizationService, type SetupOperation } from './setup-authorization.service';

const context: McpAuthContext = {
  clientId: 'test-client',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['admin'],
  resource: 'https://mcp.example.test/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};

describe('SetupAuthorizationService', () => {
  let project: Project;
  let lookup: jest.Mock;
  let authorization: SetupAuthorizationService;

  beforeEach(() => {
    project = { id: 'project-1', title: 'Project', status: 'active', roles: ['editor'] };
    lookup = jest.fn(async (userId: string, projectId: string) => {
      if (userId !== 'user-1' || projectId !== 'project-1') {
        throw new UnauthorizedException();
      }
      return project;
    });
    authorization = new SetupAuthorizationService({
      getProjectForUser: lookup,
    } as unknown as IdpProjectionsFacade);
  });

  it('returns only the server actor and current project roles', async () => {
    await expect(authorization.authorize(context, 'stored-read')).resolves.toEqual({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    });
  });

  it.each([undefined, '', '   '])('rejects a missing actor (%s)', async userId => {
    await expect(
      authorization.authorize({ ...context, userId } as McpAuthContext, 'stored-read')
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])('rejects a missing project (%s)', async projectId => {
    await expect(
      authorization.authorize({ ...context, projectId } as McpAuthContext, 'stored-read')
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a different project returned by the IdP', async () => {
    project.id = 'other-project';
    await expect(authorization.authorize(context, 'stored-read')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it.each([undefined, [], ['viewer']])('never falls back to token roles (%j)', async roles => {
    project.roles = roles as Project['roles'];
    await expect(authorization.authorize(context, 'stored-read')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it.each(['blocked', 'removed'] as const)('rejects a %s project', async status => {
    project.status = status;
    await expect(authorization.authorize(context, 'stored-read')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('accepts an admin from the current lookup even if the token role is stale', async () => {
    project.roles = ['admin'];
    await expect(
      authorization.authorize({ ...context, roles: ['viewer'] }, 'mutation')
    ).resolves.toEqual({ projectId: 'project-1', userId: 'user-1', roles: ['admin'] });
  });

  it('refreshes admission on every call, including a later recovery attempt', async () => {
    await authorization.authorize(context, 'mutation');
    project.roles = ['viewer'];
    await expect(authorization.authorize(context, 'mutation')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('propagates IdP failures without a cached actor fallback', async () => {
    const failure = new Error('IdP unavailable');
    lookup.mockRejectedValue(failure);
    await expect(authorization.authorize(context, 'stored-read')).rejects.toBe(failure);
  });

  it('allows stored reads under a read-only grant', async () => {
    await expect(
      authorization.authorize({ ...context, scopes: ['mcp:read'] }, 'stored-read')
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  it.each<SetupOperation>(['stored-read', 'mutation', 'live'])(
    'requires mcp:read for %s even with mcp:write',
    async operation => {
      await expect(
        authorization.authorize({ ...context, scopes: ['mcp:write'] }, operation)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(lookup).not.toHaveBeenCalled();
    }
  );

  it.each<SetupOperation>(['mutation', 'live'])(
    'requires mcp:write before %s starts',
    async operation => {
      await expect(
        authorization.authorize({ ...context, scopes: ['mcp:read'] }, operation)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(lookup).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, [], ['MCP:READ'], ['mcp:read ']])(
    'rejects missing or non-matching read scopes (%j)',
    async scopes => {
      await expect(
        authorization.authorize({ ...context, scopes } as McpAuthContext, 'stored-read')
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  );
});
