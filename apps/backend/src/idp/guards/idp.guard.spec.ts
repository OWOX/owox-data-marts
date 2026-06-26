import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationError, AuthorizationError, type Payload } from '@owox/idp-protocol';
import { ClsService } from 'nestjs-cls';
import { IdpProviderService } from '../services/idp-provider.service';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { Role, Strategy, type RoleConfig } from '../types';
import { REJECT_API_KEY_AUTH_METADATA } from '../decorators/reject-api-key-auth.decorator';
import { AuthenticatedRequest, AUTH_CONTEXT, IdpGuard } from './idp.guard';

describe('IdpGuard', () => {
  let roleConfig: RoleConfig;
  let rejectApiKeyAuth: boolean;
  let request: AuthenticatedRequest;
  let idpProvider: {
    parseToken: jest.Mock<Promise<Payload | null>, [string]>;
    introspectToken: jest.Mock<Promise<Payload | null>, [string]>;
  };
  let clsService: jest.Mocked<Pick<ClsService, 'set'>>;
  let idpProjectionsService: jest.Mocked<
    Pick<IdpProjectionsService, 'updateProjectionsFromIdpPayload'>
  >;
  let guard: IdpGuard;

  beforeEach(() => {
    roleConfig = Role.authenticated(Strategy.PARSE);
    rejectApiKeyAuth = false;
    request = {
      headers: {
        'x-owox-authorization': 'Bearer access-token',
      },
      method: 'GET',
    } as AuthenticatedRequest;

    idpProvider = {
      parseToken: jest.fn(),
      introspectToken: jest.fn(),
    };

    clsService = {
      set: jest.fn(),
    };

    idpProjectionsService = {
      updateProjectionsFromIdpPayload: jest.fn(),
    };

    guard = new IdpGuard(
      {
        getAllAndOverride: jest.fn((metadataKey: string) => {
          if (metadataKey === 'roleConfig') {
            return roleConfig;
          }
          if (metadataKey === REJECT_API_KEY_AUTH_METADATA) {
            return rejectApiKeyAuth;
          }
          return undefined;
        }),
      } as unknown as Reflector,
      { getProvider: jest.fn(() => idpProvider) } as unknown as IdpProviderService,
      clsService as unknown as ClsService,
      idpProjectionsService as unknown as IdpProjectionsService
    );
  });

  it('allows an authenticated user with empty roles when no project role is required', async () => {
    idpProvider.parseToken.mockResolvedValue(payload([]));

    await expect(guard.canActivate(context())).resolves.toBe(true);

    expect(request.idpContext.roles).toEqual([]);
    expect(clsService.set).toHaveBeenCalledWith(AUTH_CONTEXT, {
      userId: 'user-1',
      projectId: 'project-1',
      roles: [],
      authFlow: undefined,
      apiKeyId: undefined,
    });
  });

  it('rejects viewer authorization when token has empty roles', async () => {
    roleConfig = Role.viewer(Strategy.PARSE);
    idpProvider.parseToken.mockResolvedValue(payload([]));

    await expect(guard.canActivate(context())).rejects.toThrow(AuthorizationError);
  });

  it('keeps Role.none optional and does not authenticate', async () => {
    roleConfig = Role.none();

    await expect(guard.canActivate(context())).resolves.toBe(true);

    expect(idpProvider.parseToken).not.toHaveBeenCalled();
    expect(idpProvider.introspectToken).not.toHaveBeenCalled();
  });

  it('requires X-OWOX-Api-Key-Id to match the apiKeyId claim for api_key tokens', async () => {
    roleConfig = Role.viewer(Strategy.PARSE);
    idpProvider.parseToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
    request.headers = {
      'x-owox-authorization': 'Bearer access-token',
      'x-owox-api-key-id': 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    };

    await expect(guard.canActivate(context())).resolves.toBe(true);

    expect(request.idpContext).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
    expect(clsService.set).toHaveBeenCalledWith(
      AUTH_CONTEXT,
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['viewer'],
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
  });

  it('rejects api_key tokens when X-OWOX-Api-Key-Id is missing', async () => {
    roleConfig = Role.viewer(Strategy.PARSE);
    idpProvider.parseToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects api_key tokens on routes that disallow API key authentication', async () => {
    roleConfig = Role.viewer(Strategy.INTROSPECT);
    rejectApiKeyAuth = true;
    idpProvider.introspectToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
    request.headers = {
      'x-owox-authorization': 'Bearer access-token',
      'x-owox-api-key-id': 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    };

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects api_key tokens on disallowed routes before checking API-key header binding', async () => {
    roleConfig = Role.viewer(Strategy.INTROSPECT);
    rejectApiKeyAuth = true;
    idpProvider.introspectToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );

    await expect(guard.canActivate(context())).rejects.toThrow(
      'API key authentication is not allowed for this endpoint'
    );
  });

  it('wraps failed authentication with the generic authentication error message', async () => {
    idpProvider.parseToken.mockResolvedValue(null);

    let error: unknown;
    try {
      await guard.canActivate(context());
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as Error).message).toBe('Authentication failed');
  });

  it('allows normal user tokens on routes that disallow API key authentication', async () => {
    roleConfig = Role.viewer(Strategy.INTROSPECT);
    rejectApiKeyAuth = true;
    idpProvider.introspectToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'app_owox',
      })
    );

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('allows api_key tokens on state-changing requests when the route allows API key authentication', async () => {
    roleConfig = Role.viewer(Strategy.PARSE);
    idpProvider.parseToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
    request.method = 'POST';
    request.headers = {
      'x-owox-authorization': 'Bearer access-token',
      'x-owox-api-key-id': 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    };

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('allows normal user tokens without X-OWOX-Api-Key-Id', async () => {
    roleConfig = Role.viewer(Strategy.PARSE);
    idpProvider.parseToken.mockResolvedValue(
      payload(['viewer'], {
        authFlow: 'app_owox',
      })
    );

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  function context(): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function payload(roles: Payload['roles'], overrides: Partial<Payload> = {}): Payload {
    return {
      userId: 'user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      fullName: 'User Example',
      avatar: 'https://img.test/a.png',
      roles,
      projectTitle: 'Project 1',
      signinProvider: 'google',
      ...overrides,
    };
  }
});
