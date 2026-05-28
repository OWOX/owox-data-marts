import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationError, type IdpProvider } from '@owox/idp-protocol';
import { ClsService } from 'nestjs-cls';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { IdpProviderService } from '../services/idp-provider.service';
import { RoleConfig, Strategy } from '../types';
import { AuthenticatedRequest, AUTH_CONTEXT, IdpGuard } from './idp.guard';

describe('IdpGuard API key auth flow', () => {
  const createContext = (request: Partial<AuthenticatedRequest>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const createGuard = () => {
    const roleConfig: RoleConfig = { role: 'viewer', strategy: Strategy.PARSE };
    const reflector = {
      getAllAndOverride: jest.fn(() => roleConfig),
    } as unknown as jest.Mocked<Reflector>;

    const idpProvider = {
      parseToken: jest.fn(),
    } as unknown as jest.Mocked<IdpProvider>;

    const idpProviderService = {
      getProvider: jest.fn(() => idpProvider),
    } as unknown as jest.Mocked<IdpProviderService>;

    const cls = {
      set: jest.fn(),
    } as unknown as jest.Mocked<ClsService>;

    const idpProjectionsService = {
      updateProjectionsFromIdpPayload: jest.fn(),
    } as unknown as jest.Mocked<IdpProjectionsService>;

    const guard = new IdpGuard(reflector, idpProviderService, cls, idpProjectionsService);

    return { guard, idpProvider, cls };
  };

  it('requires X-OWOX-Api-Key-Id to match the apiKeyId claim for api_key tokens', async () => {
    const { guard, idpProvider, cls } = createGuard();
    idpProvider.parseToken.mockResolvedValue({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      authFlow: 'api_key',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });
    const request = {
      method: 'GET',
      headers: {
        'x-owox-authorization': 'Bearer access-token',
        'x-owox-api-key-id': 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      },
    } as Partial<AuthenticatedRequest>;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.idpContext).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
    expect(cls.set).toHaveBeenCalledWith(
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
    const { guard, idpProvider } = createGuard();
    idpProvider.parseToken.mockResolvedValue({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      authFlow: 'api_key',
      apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
    });

    await expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          headers: { 'x-owox-authorization': 'Bearer access-token' },
        })
      )
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('allows normal user tokens without X-OWOX-Api-Key-Id', async () => {
    const { guard, idpProvider } = createGuard();
    idpProvider.parseToken.mockResolvedValue({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
      authFlow: 'app_owox',
    });

    await expect(
      guard.canActivate(
        createContext({
          method: 'GET',
          headers: { 'x-owox-authorization': 'Bearer access-token' },
        })
      )
    ).resolves.toBe(true);
  });
});
