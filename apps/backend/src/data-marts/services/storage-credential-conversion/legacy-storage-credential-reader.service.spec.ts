import { DataSource, type Repository } from 'typeorm';
import { CredentialConsumerBinding } from '../../credentials/entities/credential-consumer-binding.entity';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { Context } from '../../entities/context.entity';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import { DataStorageCredentialService } from '../data-storage-credential.service';
import { LegacyStorageCredentialReader } from './legacy-storage-credential-reader.service';
import { STORAGES_ON_OLD_KEY_SQL, UNCONVERTED_STORAGES_SQL } from './legacy-storage-credential-sql';

describe('LegacyStorageCredentialReader', () => {
  let dataSource: DataSource;
  let storages: Repository<DataStorage>;
  let rows: Repository<DataStorageCredential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let reader: LegacyStorageCredentialReader;

  beforeAll(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        DataStorage,
        DataStorageCredential,
        StorageOwner,
        StorageContext,
        Context,
        CredentialConsumerBinding,
      ],
      synchronize: true,
      logging: false,
    }).initialize();
    storages = dataSource.getRepository(DataStorage);
    rows = dataSource.getRepository(DataStorageCredential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    reader = new LegacyStorageCredentialReader(
      storages,
      new DataStorageCredentialService(rows),
      {} as never,
      {} as never
    );
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    for (const entity of [CredentialConsumerBinding, DataStorage, DataStorageCredential]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
  });

  async function givenStorage(withRow = true): Promise<{ storageId: string; rowId: string }> {
    const row = await rows.save(
      rows.create({
        projectId: 'project-1',
        type: StorageCredentialType.AWS_IAM,
        credentials: { accessKeyId: 'AKIA1', secretAccessKey: 'secret' },
        identity: { accessKeyId: 'AKIA1' },
      })
    );
    const storage = await storages.save(
      storages.create({
        projectId: 'project-1',
        type: DataStorageType.AWS_ATHENA,
        credentialId: withRow ? row.id : null,
      })
    );
    return { storageId: storage.id, rowId: row.id };
  }

  function bind(storageId: string, overrides: Partial<CredentialConsumerBinding> = {}) {
    return bindings.save(
      bindings.create({
        projectId: 'project-1',
        credentialId: 'credential-1',
        consumerType: 'storage',
        consumerId: storageId,
        requirementKey: 'storage',
        requirementSnapshot: { definitionIds: ['aws-access-key'], scopes: [] },
        requirementRevision: 'r',
        configuredById: null,
        active: true,
        ...overrides,
      })
    );
  }

  it('reads the key of an unbound Storage from its old row', async () => {
    const { storageId } = await givenStorage();

    await expect(
      reader.resolve(await storages.findOneByOrFail({ id: storageId }))
    ).resolves.toEqual({ accessKeyId: 'AKIA1', secretAccessKey: 'secret' });
  });

  it('lists the live Storages the runtime still resolves from a live old row', async () => {
    const unbound = await givenStorage();
    const inactive = await givenStorage();
    await bind(inactive.storageId, { active: false });
    const pluginBound = await givenStorage();
    await bind(pluginBound.storageId, { consumerType: 'plugin-installation' });
    const otherRequirement = await givenStorage();
    await bind(otherRequirement.storageId, { requirementKey: 'backup' });
    const bound = await givenStorage();
    await bind(bound.storageId);
    // A move by the previous release leaves the binding behind in the old project.
    const boundElsewhere = await givenStorage();
    await bind(boundElsewhere.storageId, { projectId: 'project-2' });
    const deleted = await givenStorage();
    await storages.softDelete(deleted.storageId);
    const orphaned = await givenStorage();
    await rows.softDelete(orphaned.rowId);
    await givenStorage(false);

    const onOldKey: { id: string }[] = await storages.query(STORAGES_ON_OLD_KEY_SQL);
    const unconverted: { id: string }[] = await storages.query(UNCONVERTED_STORAGES_SQL);

    expect(onOldKey.map(({ id }) => id).sort()).toEqual(
      [
        unbound.storageId,
        inactive.storageId,
        pluginBound.storageId,
        otherRequirement.storageId,
        boundElsewhere.storageId,
      ].sort()
    );
    expect(onOldKey[0]).toEqual({ id: expect.any(String), projectId: 'project-1' });
    // The migration binds only where no storage binding row exists, as the unique index requires.
    expect(unconverted.map(({ id }) => id).sort()).toEqual(
      [unbound.storageId, pluginBound.storageId, otherRequirement.storageId].sort()
    );
  });

  it('reads the old key identity of an unbound Storage', async () => {
    const { storageId } = await givenStorage();
    const keyless = await givenStorage(false);

    expect(reader.oldKeyIdentity(await storages.findOneByOrFail({ id: storageId }))).toEqual({
      accessKeyId: 'AKIA1',
    });
    expect(
      reader.oldKeyIdentity(await storages.findOneByOrFail({ id: keyless.storageId }))
    ).toBeNull();
  });

  it('names the account of each listed Storage of the project by its old key identity', async () => {
    const given = async (identity: CredentialIdentity | null, projectId = 'project-1') => {
      const row = await rows.save(
        rows.create({
          projectId,
          type: StorageCredentialType.AWS_IAM,
          credentials: { accessKeyId: 'AKIA1', secretAccessKey: 'secret' },
          identity,
        })
      );
      const storage = await storages.save(
        storages.create({ projectId, type: DataStorageType.AWS_ATHENA, credentialId: row.id })
      );
      return storage.id;
    };
    const serviceAccount = await given({
      clientEmail: 'sa@example.iam.gserviceaccount.com',
      email: 'ann@example.com',
      username: 'ANN',
      accessKeyId: 'AKIA2',
    });
    const oauth = await given({ email: 'ann@example.com', username: 'ANN', accessKeyId: 'AKIA2' });
    const snowflake = await given({ username: 'ANN', accessKeyId: 'AKIA2' });
    const aws = await given({ accessKeyId: 'AKIA2' });
    const anonymous = await given(null);
    const otherProject = await given({ accessKeyId: 'AKIA3' }, 'project-2');
    const deleted = await given({ accessKeyId: 'AKIA4' });
    await storages.softDelete(deleted);
    const keyless = await givenStorage(false);

    await expect(
      reader.identities('project-1', [
        serviceAccount,
        oauth,
        snowflake,
        aws,
        anonymous,
        otherProject,
        deleted,
        keyless.storageId,
      ])
    ).resolves.toEqual(
      new Map([
        [serviceAccount, 'sa@example.iam.gserviceaccount.com'],
        [oauth, 'ann@example.com'],
        [snowflake, 'ANN'],
        [aws, 'AKIA2'],
        [anonymous, null],
      ])
    );
    await expect(reader.identities('project-1', [])).resolves.toEqual(new Map());
  });

  it('moves the old key row with its Storage, and does nothing for a Storage without one', async () => {
    const moved = await givenStorage();
    const keyless = await givenStorage(false);

    await reader.moveOldRow(await storages.findOneByOrFail({ id: moved.storageId }), 'project-2');
    await reader.moveOldRow(await storages.findOneByOrFail({ id: keyless.storageId }), 'project-2');

    await expect(rows.findOneByOrFail({ id: moved.rowId })).resolves.toMatchObject({
      projectId: 'project-2',
    });
    await expect(rows.findOneByOrFail({ id: keyless.rowId })).resolves.toMatchObject({
      projectId: 'project-1',
    });
  });

  it('tells which listed Storages still run on their old key', async () => {
    const unbound = await givenStorage();
    const boundElsewhere = await givenStorage();
    await bind(boundElsewhere.storageId, { projectId: 'project-2' });
    const inactive = await givenStorage();
    await bind(inactive.storageId, { active: false });
    const bound = await givenStorage();
    await bind(bound.storageId);
    const orphaned = await givenStorage();
    await rows.softDelete(orphaned.rowId);
    const keyless = await givenStorage(false);
    const deleted = await givenStorage();
    await storages.softDelete(deleted.storageId);
    const unlisted = await givenStorage();

    const onOldKey = await reader.storageIdsOnOldKey(
      [unbound, boundElsewhere, inactive, bound, orphaned, keyless, deleted].map(s => s.storageId)
    );

    expect([...onOldKey].sort()).toEqual(
      [unbound.storageId, boundElsewhere.storageId, inactive.storageId].sort()
    );
    expect(onOldKey.has(unlisted.storageId)).toBe(false);
    await expect(reader.storageIdsOnOldKey([])).resolves.toEqual(new Set());
  });
});
