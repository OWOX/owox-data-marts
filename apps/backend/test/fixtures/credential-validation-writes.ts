import type { DataSource, Repository } from 'typeorm';
import { CredentialContext } from '../../src/data-marts/credentials/entities/credential-context.entity';
import { CredentialOwner } from '../../src/data-marts/credentials/entities/credential-owner.entity';
import { Credential } from '../../src/data-marts/credentials/entities/credential.entity';
import { CredentialService } from '../../src/data-marts/credentials/services/credential.service';
import { Context } from '../../src/data-marts/entities/context.entity';
import type { CredentialSecret } from '../../src/data-marts/credentials/credential.types';
import { serviceAccountKey } from './google-service-account-key';

export const CREDENTIAL_VALIDATION_ENTITIES = [
  Credential,
  CredentialOwner,
  CredentialContext,
  Context,
];

/** Shared by the SQLite spec and the MySQL integration test: the key check runs inside the UPDATE. */
export function credentialValidationWriteCases(getDataSource: () => DataSource): void {
  const checked = { value: serviceAccountKey() };
  const replacement = { value: serviceAccountKey({ private_key_id: 'key-2' }) };
  const rejected = {
    state: 'rejected',
    message: 'invalid_grant',
    validatedAt: new Date('2026-09-02T12:00:00.000Z'),
  } as const;
  let credentials: Repository<Credential>;
  let service: CredentialService;

  beforeEach(async () => {
    credentials = getDataSource().getRepository(Credential);
    await credentials.createQueryBuilder().delete().execute();
    service = new CredentialService(
      credentials,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  });

  afterEach(() => jest.restoreAllMocks());

  async function givenCredential(secret: CredentialSecret = checked): Promise<string> {
    const saved = await credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Docs writer',
        definitionSource: 'builtin',
        definitionId: 'google-service-account',
        secret,
        validationState: 'verified',
        validationMessage: 'accepted',
        validatedAt: new Date('2026-09-01T12:00:00.000Z'),
      })
    );
    return saved.id;
  }

  async function replaceKey(id: string): Promise<void> {
    await credentials.update(
      { id },
      {
        secret: replacement,
        validationState: 'verified',
        validationMessage: 'replacement accepted',
      }
    );
  }

  async function stored(id: string) {
    return credentials.findOneOrFail({ where: { id }, withDeleted: true });
  }

  it('writes only the validation columns while the stored key is the checked one', async () => {
    const id = await givenCredential();

    await service.writeValidation(id, await stored(id), { ...rejected, message: 'x'.repeat(2500) });

    expect(await stored(id)).toMatchObject({
      title: 'Docs writer',
      secret: checked,
      validationState: 'rejected',
      validationMessage: 'x'.repeat(2000),
      validatedAt: rejected.validatedAt,
    });
  });

  it('leaves the validation of a replaced key alone', async () => {
    const id = await givenCredential();
    const read = await stored(id);
    await replaceKey(id);

    await service.writeValidation(id, read, rejected);

    expect(await stored(id)).toMatchObject({
      secret: replacement,
      validationState: 'verified',
      validationMessage: 'replacement accepted',
    });
  });

  it('writes nothing to a deleted Credential', async () => {
    const id = await givenCredential();
    const read = await stored(id);
    await credentials.softDelete({ id });

    await service.writeValidation(id, read, rejected);

    expect(await stored(id)).toMatchObject({ validationState: 'verified' });
  });

  it('writes the validation of a field set while the row is unchanged since the read', async () => {
    const id = await givenCredential({ fields: { password: 'old-password' } });

    await service.writeValidation(id, await stored(id), rejected);

    expect(await stored(id)).toMatchObject({
      secret: { fields: { password: 'old-password' } },
      validationState: 'rejected',
      validationMessage: 'invalid_grant',
    });
  });

  it('leaves the validation of a field set rewritten after the read alone', async () => {
    const id = await givenCredential({ fields: { password: 'old-password' } });
    const read = await stored(id);
    // modifiedAt has one-second precision, so the rewrite is dated a second later.
    await credentials.update(
      { id },
      {
        secret: { fields: { password: 'new-password' } },
        validationState: 'unknown',
        validationMessage: null,
        modifiedAt: new Date(read.modifiedAt.getTime() + 1000),
      }
    );

    await service.writeValidation(id, read, rejected);

    expect(await stored(id)).toMatchObject({
      secret: { fields: { password: 'new-password' } },
      validationState: 'unknown',
      validationMessage: null,
    });
  });

  it('marks the refused key rejected', async () => {
    const id = await givenCredential();

    await service.markRejected(id, checked, 'invalid_grant');

    expect(await stored(id)).toMatchObject({
      validationState: 'rejected',
      validationMessage: 'invalid_grant',
    });
  });

  it('does not mark a key replaced between the read and the write rejected', async () => {
    const id = await givenCredential();
    const findOne = credentials.findOne.bind(credentials);
    jest.spyOn(credentials, 'findOne').mockImplementationOnce(async options => {
      const read = await findOne(options);
      await replaceKey(id);
      return read;
    });

    await service.markRejected(id, checked, 'invalid_grant');

    expect(await stored(id)).toMatchObject({
      secret: replacement,
      validationState: 'verified',
      validationMessage: 'replacement accepted',
    });
  });

  function grant(refreshToken: string, accessToken = 'old-access-token'): CredentialSecret {
    return {
      oauth: {
        provider: 'google',
        clientId: 'storage-client-id',
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/bigquery',
        },
      },
    };
  }

  it('keeps modifiedAt when a refresh rewrites the tokens', async () => {
    const id = await givenCredential(grant('refresh-token-1'));
    // Dated in the past, so a write that sets modifiedAt to now shows.
    await credentials.update({ id }, { modifiedAt: new Date('2026-09-01T12:00:00.000Z') });
    const read = await stored(id);

    await service.saveRefreshedSecret(id, read, grant('refresh-token-1', 'new-access-token'));

    const after = await stored(id);
    expect(after.secret).toEqual(grant('refresh-token-1', 'new-access-token'));
    expect(after.modifiedAt).toEqual(read.modifiedAt);
  });

  it('drops a refreshed grant written after a reconnect', async () => {
    const id = await givenCredential(grant('refresh-token-1'));
    const read = await stored(id);
    // modifiedAt has one-second precision, so the reconnect is dated a second later.
    await credentials.update(
      { id },
      {
        secret: grant('reconnected-refresh-token', 'reconnected-access-token'),
        modifiedAt: new Date(read.modifiedAt.getTime() + 1000),
      }
    );

    await service.saveRefreshedSecret(id, read, grant('refresh-token-1', 'new-access-token'));

    expect(await stored(id)).toMatchObject({
      secret: grant('reconnected-refresh-token', 'reconnected-access-token'),
    });
  });

  it('does not write again when already rejected with the same message', async () => {
    const id = await givenCredential();
    await service.markRejected(id, checked, 'invalid_grant');
    const createQueryBuilder = jest.spyOn(credentials, 'createQueryBuilder');

    await service.markRejected(id, checked, 'invalid_grant');

    expect(createQueryBuilder).not.toHaveBeenCalled();
  });
}
