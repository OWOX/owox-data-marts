import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import axios, { AxiosError } from 'axios';
import { IdentityOwoxClient } from './IdentityOwoxClient.js';

function clientWithUnauthorizedResponse(data: unknown): IdentityOwoxClient {
  const http = axios.create({
    adapter: config =>
      Promise.reject(
        new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, {
          data,
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        })
      ),
  });
  jest.spyOn(axios, 'create').mockReturnValueOnce(http);
  jest.spyOn(ImpersonatedIdTokenFetcher.prototype, 'getIdToken').mockResolvedValue('c2c-id-token');

  return new IdentityOwoxClient({
    clientBaseUrl: 'https://idp.example.com',
    clientTimeout: '3s',
    clientBackchannelPrefix: '/internal/',
    c2cServiceAccountEmail: 'service@example.iam.gserviceaccount.com',
    c2cTargetAudience: 'https://idp.example.com/internal',
  });
}

describe('IdentityOwoxClient project switch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['Authentication Error', 'Authentication Error, Invalid token'])(
    'classifies the IB 401 with message %j as an invalid App session',
    async message => {
      await expect(
        clientWithUnauthorizedResponse({ message }).switchProject(
          'refresh-token',
          'app-owox',
          'project-2',
          'user-1'
        )
      ).rejects.toMatchObject({ name: 'AuthenticationException', status: 401 });
    }
  );

  it.each(['', { message: 'Unknown authentication error' }])(
    'keeps an unrecognized 401 body %j as an upstream failure',
    async data => {
      await expect(
        clientWithUnauthorizedResponse(data).switchProject(
          'refresh-token',
          'app-owox',
          'project-2',
          'user-1'
        )
      ).rejects.toMatchObject({ name: 'IdpFailedException' });
    }
  );
});
