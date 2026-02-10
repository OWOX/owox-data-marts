/**
 * Tests for TokenService JWT validation.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import { TokenService, type TokenServiceConfig } from './token-service.js';
import type { IdentityOwoxClient } from '../../client/index.js';

describe('TokenService', () => {
  it('parses signed token with cached JWKS', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    (publicJwk as Record<string, unknown>).kid = 'test-key';

    const mockClient = {
      getJwks: jest.fn<IdentityOwoxClient['getJwks']>().mockResolvedValue({ keys: [publicJwk] }),
      getToken: jest.fn(),
      revokeToken: jest.fn(),
      introspectToken: jest.fn(),
      getProjects: jest.fn(),
    } as unknown as IdentityOwoxClient;

    const config: TokenServiceConfig = {
      algorithm: 'RS256',
      clockTolerance: '0s',
      issuer: 'https://issuer.test',
      jwtKeyCacheTtl: '5m',
    };

    const payload = {
      userId: 'user-1',
      projectId: 'project-1',
      userEmail: 'user@example.com',
      userFullName: 'User Example',
      userAvatar: 'https://img.test/a.png',
      roles: ['admin'],
      projectTitle: 'Demo',
      iss: config.issuer,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(config.issuer)
      .setAudience('owox-test')
      .setExpirationTime('1h')
      .sign(privateKey);

    const service = new TokenService(mockClient, config);
    const result = await service.parse(`Bearer ${token}`);

    expect(result?.email).toBe(payload.userEmail);
    expect(mockClient.getJwks).toHaveBeenCalled();
  });
});
