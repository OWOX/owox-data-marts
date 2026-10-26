import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { AuthorizationContext } from '../../../idp';
import { REDIRECT_URI, googleOAuthFlow } from '../../../../test/fixtures/google-oauth';
import { AuthorizeGoogleOAuthCredentialService } from './authorize-google-oauth-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

function setup({ canEdit = true, secret = { oauth: {} } as object } = {}) {
  const credentials = {
    getByIdAndProjectId: jest
      .fn()
      .mockResolvedValue({ id: 'credential-1', definitionId: 'google-oauth', secret }),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(canEdit) };
  const service = new AuthorizeGoogleOAuthCredentialService(
    credentials as never,
    access as never,
    googleOAuthFlow().flow
  );
  return { service, credentials };
}

describe('AuthorizeGoogleOAuthCredentialService', () => {
  it('returns only the authorization URL of a new Credential', async () => {
    const { service, credentials } = setup();

    const result = await service.run(context, { redirectUri: REDIRECT_URI });

    expect(Object.keys(result)).toEqual(['authorizationUrl']);
    const url = new URL(result.authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe('storage-client-id');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/bigquery');
    expect(jwt.decode(url.searchParams.get('state')!)).toMatchObject({
      type: 'credential',
      projectId: 'project-1',
      definitionId: 'google-oauth',
    });
    expect(credentials.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('carries the definition it is given in the state', async () => {
    const { service } = setup();

    const result = await service.run(context, {
      redirectUri: REDIRECT_URI,
      definitionId: 'google-oauth',
    });

    const state = new URL(result.authorizationUrl).searchParams.get('state')!;
    expect(jwt.decode(state)).toMatchObject({ definitionId: 'google-oauth' });
  });

  it.each([
    ['a definition that is not a Google account', { definitionId: 'aws-access-key' }],
    [
      'a reconnect to another definition',
      { definitionId: 'google-service-account', credentialId: 'credential-1' },
    ],
  ])('refuses %s', async (_case, input) => {
    const { service } = setup();

    await expect(service.run(context, { redirectUri: REDIRECT_URI, ...input })).rejects.toThrow(
      BadRequestException
    );
  });

  it('binds a reconnect to the Credential', async () => {
    const { service } = setup();

    const result = await service.run(context, {
      redirectUri: REDIRECT_URI,
      credentialId: 'credential-1',
    });

    const state = new URL(result.authorizationUrl).searchParams.get('state')!;
    expect(jwt.decode(state)).toMatchObject({ resourceId: 'credential-1' });
  });

  it('refuses to reconnect a Credential the member cannot edit', async () => {
    const { service } = setup({ canEdit: false });

    await expect(
      service.run(context, { redirectUri: REDIRECT_URI, credentialId: 'credential-1' })
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to reconnect a Credential that is not a Google account', async () => {
    const { service } = setup({ secret: { value: 'api-key' } });

    await expect(
      service.run(context, { redirectUri: REDIRECT_URI, credentialId: 'credential-1' })
    ).rejects.toThrow(BadRequestException);
  });
});
