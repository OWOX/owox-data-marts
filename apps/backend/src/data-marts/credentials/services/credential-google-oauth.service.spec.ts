import { Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { DataSource, QueryFailedError, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../../test/fixtures/credential-validation-writes';
import { googleOAuthConfig } from '../../../../test/fixtures/google-oauth';
import {
  CredentialsExpiredException,
  TokenRefreshFailedException,
} from '../../exceptions/google-oauth.exceptions';
import type { StoredOAuthTokens } from '../credential.types';
import { Credential } from '../entities/credential.entity';
import { CredentialGoogleOAuthService } from './credential-google-oauth.service';
import { CredentialService } from './credential.service';

const READ_AT = new Date('2026-09-01T12:00:00.000Z');

describe('CredentialGoogleOAuthService (SQLite)', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let service: CredentialGoogleOAuthService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    // The config, the refresh failures and GoogleOAuthException log what these cases expect.
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    credentials = dataSource.getRepository(Credential);
    await credentials.createQueryBuilder().delete().execute();
    service = new CredentialGoogleOAuthService(
      new CredentialService(
        credentials,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      ),
      googleOAuthConfig()
    );
  });

  afterEach(() => jest.restoreAllMocks());

  async function givenCredential(
    tokens: Partial<StoredOAuthTokens> = {},
    clientId = 'storage-client-id'
  ): Promise<string> {
    const saved = await credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'analyst@example.com',
        definitionSource: 'builtin',
        definitionId: 'google-oauth',
        secret: {
          oauth: {
            provider: 'google',
            clientId,
            tokens: {
              access_token: 'old-access-token',
              refresh_token: 'refresh-token-1',
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/bigquery',
              expiry_date: Date.now() + 60 * 60 * 1000,
              ...tokens,
            },
          },
        },
        publicMetadata: {
          account: { email: 'analyst@example.com', name: null, picture: null },
          scopes: ['https://www.googleapis.com/auth/bigquery'],
        },
        validationState: 'verified',
        validationMessage: 'Google account connected',
      })
    );
    await credentials.update({ id: saved.id }, { modifiedAt: READ_AT });
    return saved.id;
  }

  const stored = (id: string) => credentials.findOneByOrFail({ id });
  const expired = () => ({ expiry_date: Date.now() - 1000 });

  function googleRefreshes(fresh: object) {
    return jest
      .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
      .mockResolvedValue({ credentials: fresh, res: null } as never);
  }

  it('builds the client of the recorded OAuth client without refreshing a fresh token', async () => {
    const refresh = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken');
    const id = await givenCredential({}, 'destination-client-id');

    const { client, clientId } = await service.getOAuth2Client(id);

    expect(clientId).toBe('destination-client-id');
    expect(client.credentials.access_token).toBe('old-access-token');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps refresh_token when Google omits it', async () => {
    googleRefreshes({ access_token: 'new-access-token', expiry_date: 1_900_000_000_000 });
    const id = await givenCredential(expired());

    const { client } = await service.getOAuth2Client(id);

    expect(client.credentials.access_token).toBe('new-access-token');
    const after = await stored(id);
    expect(after.secret).toEqual({
      oauth: {
        provider: 'google',
        clientId: 'storage-client-id',
        tokens: {
          access_token: 'new-access-token',
          refresh_token: 'refresh-token-1',
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/bigquery',
          expiry_date: 1_900_000_000_000,
        },
      },
    });
    // A refresh keeps the grant, so a validation written for it still applies.
    expect(after.modifiedAt).toEqual(READ_AT);
  });

  it('refreshes once for concurrent callers', async () => {
    const refresh = googleRefreshes({ access_token: 'new-access-token' });
    const id = await givenCredential(expired());

    await Promise.all([service.getOAuth2Client(id), service.getOAuth2Client(id)]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('invalid_grant marks the Credential rejected and throws CredentialsExpiredException', async () => {
    jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        response: { data: { error: 'invalid_grant' } },
      }) as never
    );
    const id = await givenCredential(expired());

    const failure = service.getOAuth2Client(id);

    await expect(failure).rejects.toThrow(CredentialsExpiredException);
    await expect(failure).rejects.toThrow(
      'Google authorization expired or was revoked. Reconnect this Credential.'
    );
    expect(await stored(id)).toMatchObject({
      validationState: 'rejected',
      validationMessage: 'Google authorization expired or was revoked. Reconnect this Credential.',
      secret: { oauth: { tokens: { refresh_token: 'refresh-token-1' } } },
    });
  });

  it('marks a Credential without a refresh token rejected once its token expires', async () => {
    const refresh = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken');
    const id = await givenCredential({ ...expired(), refresh_token: undefined });

    await expect(service.getOAuth2Client(id)).rejects.toThrow(CredentialsExpiredException);
    expect(await stored(id)).toMatchObject({ validationState: 'rejected' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('turns any other refresh error into TokenRefreshFailedException and keeps the Credential', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
      .mockRejectedValue(new Error('socket hang up') as never);
    const id = await givenCredential(expired());

    await expect(service.getOAuth2Client(id)).rejects.toThrow(TokenRefreshFailedException);
    expect(await stored(id)).toMatchObject({
      validationState: 'verified',
      secret: { oauth: { tokens: { access_token: 'old-access-token' } } },
    });
  });

  it('fails a refresh that returns no access_token without writing it', async () => {
    googleRefreshes({ expiry_date: 1_900_000_000_000 });
    const id = await givenCredential(expired());

    await expect(service.getOAuth2Client(id)).rejects.toThrow(TokenRefreshFailedException);
    expect(await stored(id)).toMatchObject({
      secret: { oauth: { tokens: { access_token: 'old-access-token' } } },
    });
  });

  it('does not overwrite a grant reconnected during the refresh', async () => {
    const id = await givenCredential(expired());
    jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockImplementation(async () => {
      const current = await stored(id);
      await credentials.update(
        { id },
        {
          secret: {
            oauth: {
              ...(current.secret as { oauth: object }).oauth,
              tokens: { access_token: 'reconnected-access', refresh_token: 'reconnected-refresh' },
            },
          } as never,
          modifiedAt: new Date(READ_AT.getTime() + 1000),
        }
      );
      return { credentials: { access_token: 'new-access-token' }, res: null } as never;
    });

    await service.getOAuth2Client(id);

    expect(await stored(id)).toMatchObject({
      secret: { oauth: { tokens: { refresh_token: 'reconnected-refresh' } } },
    });
  });

  it('logs only the message when saving the refreshed tokens fails', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    googleRefreshes({ access_token: 'new-access-token', refresh_token: 'new-refresh-token' });
    jest
      .spyOn(CredentialService.prototype, 'saveRefreshedSecret')
      .mockRejectedValue(
        new QueryFailedError(
          'UPDATE credential SET secret = ?',
          ['{"access_token":"new-access-token","refresh_token":"new-refresh-token"}'],
          new Error('Lock wait timeout exceeded')
        )
      );
    const id = await givenCredential(expired());

    const error = await service.getOAuth2Client(id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TokenRefreshFailedException);
    expect((error as TokenRefreshFailedException).internalDetails).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      `Failed to save refreshed Google tokens for Credential ${id}: Lock wait timeout exceeded`
    );
    for (const args of logged.mock.calls) {
      expect(args.every(arg => typeof arg === 'string')).toBe(true);
      expect(args.join(' ')).not.toMatch(/new-access-token|new-refresh-token/);
    }
  });

  it('still asks to reconnect when recording the expired grant fails', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest
      .spyOn(CredentialService.prototype, 'writeValidation')
      .mockRejectedValue(new Error('Lock wait timeout exceeded'));
    const id = await givenCredential({ ...expired(), refresh_token: undefined });

    await expect(service.getOAuth2Client(id)).rejects.toThrow(CredentialsExpiredException);
    expect(logged).toHaveBeenCalledWith(
      `Failed to save the expired Google grant state for Credential ${id}: Lock wait timeout exceeded`
    );
  });

  it('unknown clientId throws', async () => {
    const refresh = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken');
    const id = await givenCredential(expired(), 'retired-client-id');

    await expect(service.getOAuth2Client(id)).rejects.toThrow(
      'OAuth client is no longer configured.'
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
