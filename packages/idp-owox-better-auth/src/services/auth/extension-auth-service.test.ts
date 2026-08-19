import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthenticationException } from '../../core/exceptions.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { ExtensionIdentityResolver } from './extension-identity-resolver.js';
import { ExtensionAuthService } from './extension-auth-service.js';
import type {
  MicrosoftEntraAccessTokenVerifier,
  VerifiedMicrosoftIdentity,
} from './microsoft-entra-access-token-verifier.js';

const identity: VerifiedMicrosoftIdentity = {
  oid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  replayKey: `sha256:${'a'.repeat(64)}`,
  expiresAt: new Date(Date.now() + 60_000),
};
const auth = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('ExtensionAuthService', () => {
  let verifier: jest.Mocked<MicrosoftEntraAccessTokenVerifier>;
  let resolver: jest.Mocked<ExtensionIdentityResolver>;
  let store: jest.Mocked<DatabaseStore>;
  let facade: jest.Mocked<OwoxTokenFacade>;
  let service: ExtensionAuthService;

  beforeEach(() => {
    verifier = {
      verify: jest.fn().mockResolvedValue(identity),
    } as unknown as jest.Mocked<MicrosoftEntraAccessTokenVerifier>;
    resolver = {
      resolveMicrosoft: jest.fn().mockResolvedValue({ status: 'resolved', userId: 'bi-user-1' }),
    } as unknown as jest.Mocked<ExtensionIdentityResolver>;
    store = {
      consumeExtensionAssertion: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DatabaseStore>;
    facade = {
      issueExtensionSession: jest.fn().mockResolvedValue({ mode: 'identity_session', auth }),
      revokeExtensionSession: jest.fn(),
      revokeExtensionProjectToken: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;
    service = new ExtensionAuthService(verifier, resolver, store, facade);
  });

  it('issues directly for an explicit project and never derives a project itself', async () => {
    facade.issueExtensionSession.mockResolvedValue({ mode: 'project_token', auth });

    await expect(
      service.exchangeMicrosoftAssertion('entra-assertion', 'project-2')
    ).resolves.toEqual({ status: 'authenticated', auth });
    expect(facade.issueExtensionSession).toHaveBeenCalledWith('bi-user-1', 'project-2');
  });

  it('uses the project-neutral bootstrap branch when project id is absent', async () => {
    await service.exchangeMicrosoftAssertion('entra-assertion');

    expect(facade.issueExtensionSession).toHaveBeenCalledWith('bi-user-1', undefined);
  });

  it('returns typed unknown_identity without calling IB token issuing', async () => {
    resolver.resolveMicrosoft.mockResolvedValue({ status: 'unknown_identity' });

    await expect(service.exchangeMicrosoftAssertion('entra-assertion')).resolves.toEqual({
      status: 'unknown_identity',
    });
    expect(facade.issueExtensionSession).not.toHaveBeenCalled();
  });

  it('atomically rejects replay before resolving or linking the identity', async () => {
    store.consumeExtensionAssertion.mockResolvedValue(false);

    await expect(service.exchangeMicrosoftAssertion('entra-assertion')).rejects.toMatchObject({
      description: 'assertion_replayed',
    });
    expect(resolver.resolveMicrosoft).not.toHaveBeenCalled();
    expect(facade.issueExtensionSession).not.toHaveBeenCalled();
  });

  it('falls back to ordinary project-token revocation only for a token-type mismatch', async () => {
    facade.revokeExtensionSession.mockRejectedValue(
      new AuthenticationException('Not an identity-session refresh token')
    );

    await service.revoke('project-refresh-token');

    expect(facade.revokeExtensionProjectToken).toHaveBeenCalledWith('project-refresh-token');
  });
});
