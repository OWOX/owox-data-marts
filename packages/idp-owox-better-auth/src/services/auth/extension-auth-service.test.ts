import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import { ExtensionAuthService } from './extension-auth-service.js';
import type {
  MicrosoftEntraAccessTokenVerifier,
  VerifiedMicrosoftIdentity,
} from './microsoft-entra-access-token-verifier.js';

const identity: VerifiedMicrosoftIdentity = {
  oid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  verifiedEmail: 'user@example.com',
  firstName: 'User',
  lastName: 'Name',
  fullName: 'User Name',
};
const auth = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('ExtensionAuthService', () => {
  let verifier: jest.Mocked<MicrosoftEntraAccessTokenVerifier>;
  let facade: jest.Mocked<OwoxTokenFacade>;
  let service: ExtensionAuthService;

  beforeEach(() => {
    verifier = {
      verify: jest.fn().mockResolvedValue(identity),
    } as unknown as jest.Mocked<MicrosoftEntraAccessTokenVerifier>;
    facade = {
      exchangeMicrosoftExtensionIdentity: jest.fn().mockResolvedValue(auth),
      refreshExtensionProjectToken: jest.fn().mockResolvedValue(auth),
      revokeExtensionProjectToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OwoxTokenFacade>;
    service = new ExtensionAuthService(verifier, facade);
  });

  it('delegates verified identity and an explicit project to IB', async () => {
    await expect(
      service.exchangeMicrosoftAssertion('entra-assertion', 'project-2')
    ).resolves.toEqual({ status: 'authenticated', auth });
    expect(facade.exchangeMicrosoftExtensionIdentity).toHaveBeenCalledWith({
      oid: identity.oid,
      tid: identity.tid,
      email: identity.verifiedEmail,
      firstName: identity.firstName,
      lastName: identity.lastName,
      fullName: identity.fullName,
      biProjectId: 'project-2',
    });
  });

  it('lets ROI select or create the initial project when project id is absent', async () => {
    await service.exchangeMicrosoftAssertion('entra-assertion');

    expect(facade.exchangeMicrosoftExtensionIdentity).toHaveBeenCalledWith(
      expect.not.objectContaining({ biProjectId: expect.anything() })
    );
  });

  it('returns unknown_identity when Entra does not provide a safely verified email', async () => {
    verifier.verify.mockResolvedValue({ oid: identity.oid, tid: identity.tid });

    await expect(service.exchangeMicrosoftAssertion('entra-assertion')).resolves.toEqual({
      status: 'unknown_identity',
    });
    expect(facade.exchangeMicrosoftExtensionIdentity).not.toHaveBeenCalled();
  });

  it('delegates refresh and revoke only through the project-token boundary', async () => {
    await expect(service.refreshProjectToken('refresh-token')).resolves.toEqual(auth);
    await service.revokeProjectToken('refresh-token');

    expect(facade.refreshExtensionProjectToken).toHaveBeenCalledWith('refresh-token');
    expect(facade.revokeExtensionProjectToken).toHaveBeenCalledWith('refresh-token');
  });
});
