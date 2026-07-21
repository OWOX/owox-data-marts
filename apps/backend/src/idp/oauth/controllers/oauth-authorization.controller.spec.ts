import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AuthorizationError,
  ViewOnlyModeError,
  type McpOAuthProjectMemberContext,
  type Payload,
} from '@owox/idp-protocol';
import { IdpProviderService } from '../../services/idp-provider.service';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthIdpPort } from '../oauth-idp.port';
import { OAuthProjectSelectionService } from '../oauth-project-selection.service';
import { OAuthProjectMemberResolver } from '../oauth-project-member.resolver';
import { OAuthRequestValidator } from '../oauth-request.validator';
import { OAuthAuthorizationController } from './oauth-authorization.controller';

describe('OAuthAuthorizationController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const authorizationRequest = {
    clientId: 'client-1',
    redirectUri: 'http://127.0.0.1:63888/callback',
    resource: 'http://localhost:3000/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    state: 'state-1',
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
  } as const;
  const sharedResourceContext = {
    kind: 'shared',
    resource: authorizationRequest.resource,
    publicBaseUrl: 'http://localhost:3000',
    projectId: null,
  } as const;

  const payload: Payload = {
    userId: 'user-1',
    projectId: 'project-1',
    email: 'user@example.com',
    fullName: 'User One',
    roles: ['admin'],
  };

  const projectMember: McpOAuthProjectMemberContext = {
    userId: 'user-1',
    projectId: 'project-1',
    email: 'user@example.com',
    fullName: 'User One',
    roles: ['admin'],
  };

  function createResponse(): jest.Mocked<Pick<Response, 'cookie' | 'redirect' | 'type' | 'send'>> {
    return {
      cookie: jest.fn(),
      redirect: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as jest.Mocked<Pick<Response, 'cookie' | 'redirect' | 'type' | 'send'>>;
  }

  function createRequest(overrides: Partial<Request> = {}) {
    return {
      headers: {},
      cookies: {},
      protocol: 'http',
      hostname: 'localhost',
      originalUrl:
        '/oauth/authorize?client_id=client-1&redirect_uri=http%3A%2F%2F127.0.0.1%3A63888%2Fcallback',
      url: '/oauth/authorize',
      get: jest.fn((name: string) => (name === 'host' ? 'localhost:3000' : undefined)),
      ...overrides,
    } as unknown as Request;
  }

  function createController(
    validatedAuthorizationRequest: Awaited<
      ReturnType<OAuthRequestValidator['validateAuthorizationRequest']>
    > = {
      request: authorizationRequest,
      resourceContext: sharedResourceContext,
    }
  ) {
    const validator = {
      validateAuthorizationRequest: jest.fn().mockResolvedValue(validatedAuthorizationRequest),
    } as unknown as jest.Mocked<OAuthRequestValidator>;
    const projectMemberResolver = {
      resolve: jest.fn().mockReturnValue(projectMember),
    } as unknown as jest.Mocked<OAuthProjectMemberResolver>;
    const provider = {
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenExpiresIn: 3600,
      }),
      parseToken: jest.fn().mockResolvedValue(payload),
      getProjects: jest.fn().mockResolvedValue([{ id: 'project-1', title: 'Project 1' }]),
      getProjectMembers: jest.fn(),
    };
    const idpProviderService = {
      getProvider: jest.fn().mockReturnValue(provider),
    } as unknown as jest.Mocked<IdpProviderService>;
    const oauthIdp = {
      createAuthorizationCode: jest.fn().mockResolvedValue({
        code: 'auth-code-1',
        clientId: authorizationRequest.clientId,
        redirectUri: authorizationRequest.redirectUri,
        resource: authorizationRequest.resource,
        scopes: authorizationRequest.scopes,
        expiresAt: '2026-06-11T08:40:00.000Z',
      }),
    } as unknown as jest.Mocked<OAuthIdpPort>;
    const clientRegistry = {
      attachUserIfMissing: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OAuthClientRegistry>;
    const projectSelectionService = {
      loadProjects: jest.fn().mockResolvedValue([{ id: 'project-1', title: 'Project 1' }]),
      filterSelectableProjects: jest.fn(projects =>
        projects.filter(project => project.status !== 'removed')
      ),
      resolveSelectedProjectMember: jest.fn().mockResolvedValue(projectMember),
      resolveProjectHostMember: jest.fn().mockResolvedValue(projectMember),
      renderSelectionPage: jest.fn().mockReturnValue('<html>Select project</html>'),
    } as unknown as jest.Mocked<OAuthProjectSelectionService>;
    return {
      controller: new (OAuthAuthorizationController as unknown as new (
        ...args: unknown[]
      ) => OAuthAuthorizationController)(
        validator,
        projectMemberResolver,
        idpProviderService,
        oauthIdp,
        clientRegistry,
        projectSelectionService
      ),
      validator,
      projectMemberResolver,
      provider,
      oauthIdp,
      clientRegistry,
      projectSelectionService,
    };
  }

  it('redirects unauthenticated browser requests to sign-in with OAuth continuation', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const { controller, validator, oauthIdp } = createController();
    const response = createResponse();
    const request = createRequest({
      originalUrl:
        '/oauth/authorize?response_type=code&client_id=client-1&state=state-1&code_challenge=challenge&redirect_uri=http%3A%2F%2F127.0.0.1%3A63888%2Fcallback',
    });

    await controller.authorize({}, request, response as unknown as Response);

    expect(validator.validateAuthorizationRequest).toHaveBeenCalledWith({});
    expect(response.redirect).toHaveBeenCalledTimes(1);
    const redirectUrl = response.redirect.mock.calls[0]?.[0] as string;
    expect(redirectUrl).toContain('/auth/sign-in?');
    const params = new URLSearchParams(redirectUrl.split('?')[1]);
    expect(params.get('redirect')).toContain('/oauth/authorize?');
    expect(params.get('redirect')).toContain('client_id=client-1');
    expect(params.get('redirect-to')).toContain('/oauth/authorize?');
    expect(params.get('redirect-to')).toContain('client_id=client-1');
    expect(params.get('app-redirect-to')).toContain('/oauth/authorize?');
    expect(params.get('app-redirect-to')).toContain('client_id=client-1');
    expect(loggerSpy).toHaveBeenCalledWith(
      'Redirecting OAuth authorize request to sign-in',
      expect.objectContaining({
        clientId: 'client-1',
        host: 'localhost:3000',
        protocol: 'http',
      })
    );
    const loggedMetadata = loggerSpy.mock.calls[0]?.[1];
    expect(JSON.stringify(loggedMetadata)).not.toContain('state-1');
    expect(JSON.stringify(loggedMetadata)).not.toContain('code_challenge');
    expect(JSON.stringify(loggedMetadata)).not.toContain('redirect_uri');
    expect(oauthIdp.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('does not derive the MCP resource from the canonical authorization host', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const projectAuthorizationRequest = {
      ...authorizationRequest,
      resource: `http://${projectId}.localhost:3000/mcp`,
    };
    const { controller, validator } = createController({
      request: projectAuthorizationRequest,
      resourceContext: {
        kind: 'project',
        resource: projectAuthorizationRequest.resource,
        publicBaseUrl: `http://${projectId}.localhost:3000`,
        projectId,
      },
    });
    const response = createResponse();
    const request = createRequest();
    const query = {
      client_id: 'client-1',
      resource: projectAuthorizationRequest.resource,
    };

    await controller.authorize(query, request, response as unknown as Response);

    expect(validator.validateAuthorizationRequest).toHaveBeenCalledWith(query);
  });

  it('issues authorization code for browser requests with refresh token cookie', async () => {
    const { controller, provider, projectMemberResolver, oauthIdp, clientRegistry } =
      createController();
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await controller.authorize({}, request, response as unknown as Response);

    expect(provider.refreshToken).toHaveBeenCalledWith('refresh-token-1');
    expect(provider.parseToken).toHaveBeenCalledWith('access-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'new-refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 3600_000,
      })
    );
    expect(projectMemberResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
      })
    );
    expect(oauthIdp.createAuthorizationCode).toHaveBeenCalledWith(
      authorizationRequest,
      projectMember
    );
    expect(clientRegistry.attachUserIfMissing).toHaveBeenCalledWith('client-1', 'user-1');
    expect(clientRegistry.attachUserIfMissing.mock.invocationCallOrder[0]).toBeLessThan(
      oauthIdp.createAuthorizationCode.mock.invocationCallOrder[0]
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'http://127.0.0.1:63888/callback?code=auth-code-1&state=state-1'
    );
  });

  it('rejects API-key access tokens for OAuth authorization', async () => {
    const { controller, provider, oauthIdp } = createController();
    provider.parseToken.mockResolvedValueOnce({
      ...payload,
      authFlow: 'api_key',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });
    const response = createResponse();
    const request = createRequest({
      headers: {
        'x-owox-authorization': 'Bearer api-key-access-token',
        'x-owox-api-key-id': 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
    });

    await expect(
      controller.authorize({}, request, response as unknown as Response)
    ).rejects.toThrow(AuthorizationError);
    expect(oauthIdp.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('rejects view-only sessions from obtaining MCP authorization codes', async () => {
    const { controller, provider, oauthIdp, clientRegistry } = createController();
    provider.parseToken.mockResolvedValueOnce({
      ...payload,
      viewOnly: true,
    });
    const response = createResponse();
    const request = createRequest({
      headers: { 'x-owox-authorization': 'Bearer view-only-access-token' },
    });

    await expect(
      controller.authorize({}, request, response as unknown as Response)
    ).rejects.toThrow(ViewOnlyModeError);
    expect(oauthIdp.createAuthorizationCode).not.toHaveBeenCalled();
    expect(clientRegistry.attachUserIfMissing).not.toHaveBeenCalled();
  });

  it('rejects view-only sessions resolved via refresh cookie', async () => {
    const { controller, provider, oauthIdp } = createController();
    provider.parseToken.mockResolvedValueOnce({
      ...payload,
      viewOnly: true,
    });
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await expect(
      controller.authorize({}, request, response as unknown as Response)
    ).rejects.toThrow(ViewOnlyModeError);
    expect(provider.refreshToken).toHaveBeenCalledWith('refresh-token-1');
    expect(oauthIdp.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('renders MCP project selection when authenticated user has multiple projects and none is selected', async () => {
    const { controller, oauthIdp, projectSelectionService } = createController();
    projectSelectionService.loadProjects.mockResolvedValueOnce([
      { id: 'project-1', title: 'Project 1', status: 'active' },
      { id: 'project-2', title: 'Project 2', status: 'blocked' },
    ]);
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await controller.authorize({}, request, response as unknown as Response);

    expect(projectSelectionService.renderSelectionPage).toHaveBeenCalledWith({
      authorizationRequest,
      projects: [
        { id: 'project-1', title: 'Project 1', status: 'active' },
        { id: 'project-2', title: 'Project 2', status: 'blocked' },
      ],
      currentProjectId: 'project-1',
    });
    expect(response.type).toHaveBeenCalledWith('html');
    expect(response.send).toHaveBeenCalledWith('<html>Select project</html>');
    expect(oauthIdp.createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('uses selected project when authenticated user submits MCP project selection', async () => {
    const { controller, oauthIdp, projectSelectionService } = createController();
    const selectedProjectMember: McpOAuthProjectMemberContext = {
      ...projectMember,
      projectId: 'project-2',
      roles: ['admin'],
    };
    projectSelectionService.loadProjects.mockResolvedValueOnce([
      { id: 'project-1', title: 'Project 1', status: 'active' },
      { id: 'project-2', title: 'Project 2', status: 'active' },
    ]);
    projectSelectionService.resolveSelectedProjectMember.mockResolvedValueOnce(
      selectedProjectMember
    );
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await controller.authorize(
      { selected_project_id: 'project-2' },
      request,
      response as unknown as Response
    );

    expect(projectSelectionService.resolveSelectedProjectMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', projectId: 'project-1' }),
      [
        { id: 'project-1', title: 'Project 1', status: 'active' },
        { id: 'project-2', title: 'Project 2', status: 'active' },
      ],
      'project-2'
    );
    expect(oauthIdp.createAuthorizationCode).toHaveBeenCalledWith(
      authorizationRequest,
      selectedProjectMember
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'http://127.0.0.1:63888/callback?code=auth-code-1&state=state-1'
    );
  });

  it('skips project picker for project-specific MCP resources', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const projectAuthorizationRequest = {
      ...authorizationRequest,
      resource: `https://${projectId}.mcp.owox.com/mcp`,
    };
    const { controller, oauthIdp, projectSelectionService } = createController({
      request: projectAuthorizationRequest,
      resourceContext: {
        kind: 'project',
        resource: projectAuthorizationRequest.resource,
        publicBaseUrl: `https://${projectId}.mcp.owox.com`,
        projectId,
      },
    });
    projectSelectionService.loadProjects.mockResolvedValueOnce([
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', title: 'Other project', status: 'active' },
      { id: projectId, title: 'Project from host', status: 'active', roles: ['admin'] },
    ]);
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await controller.authorize({}, request, response as unknown as Response);

    expect(projectSelectionService.renderSelectionPage).not.toHaveBeenCalled();
    expect(projectSelectionService.resolveProjectHostMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', projectId: 'project-1' }),
      [
        { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', title: 'Other project', status: 'active' },
        { id: projectId, title: 'Project from host', status: 'active', roles: ['admin'] },
      ],
      projectId
    );
    expect(oauthIdp.createAuthorizationCode).toHaveBeenCalledWith(
      projectAuthorizationRequest,
      projectMember
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'http://127.0.0.1:63888/callback?code=auth-code-1&state=state-1'
    );
  });

  it('attaches user to dynamic client when authorization flow starts even if authorization code creation fails', async () => {
    const { controller, oauthIdp, clientRegistry } = createController();
    oauthIdp.createAuthorizationCode.mockRejectedValueOnce(new Error('IB unavailable'));
    const response = createResponse();
    const request = createRequest({ cookies: { refreshToken: 'refresh-token-1' } });

    await expect(
      controller.authorize({}, request, response as unknown as Response)
    ).rejects.toThrow('IB unavailable');

    expect(clientRegistry.attachUserIfMissing).toHaveBeenCalledWith('client-1', 'user-1');
    expect(response.redirect).not.toHaveBeenCalled();
  });
});
