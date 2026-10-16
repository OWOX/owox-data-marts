import type { DataSource, Repository } from 'typeorm';
import { CredentialContext } from '../../src/data-marts/credentials/entities/credential-context.entity';
import { CredentialOwner } from '../../src/data-marts/credentials/entities/credential-owner.entity';
import { Credential } from '../../src/data-marts/credentials/entities/credential.entity';
import { CredentialService } from '../../src/data-marts/credentials/services/credential.service';
import { Context } from '../../src/data-marts/entities/context.entity';
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
    service = new CredentialService(credentials, {} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  async function givenCredential(): Promise<string> {
    const saved = await credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Docs writer',
        definitionSource: 'builtin',
        definitionId: 'google-service-account',
        secret: checked,
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

    await service.writeValidation(id, checked, { ...rejected, message: 'x'.repeat(2500) });

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
    await replaceKey(id);

    await service.writeValidation(id, checked, rejected);

    expect(await stored(id)).toMatchObject({
      secret: replacement,
      validationState: 'verified',
      validationMessage: 'replacement accepted',
    });
  });

  it('writes nothing to a deleted Credential', async () => {
    const id = await givenCredential();
    await credentials.softDelete({ id });

    await service.writeValidation(id, checked, rejected);

    expect(await stored(id)).toMatchObject({ validationState: 'verified' });
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

  it('does not write again when already rejected with the same message', async () => {
    const id = await givenCredential();
    await service.markRejected(id, checked, 'invalid_grant');
    const createQueryBuilder = jest.spyOn(credentials, 'createQueryBuilder');

    await service.markRejected(id, checked, 'invalid_grant');

    expect(createQueryBuilder).not.toHaveBeenCalled();
  });
}
