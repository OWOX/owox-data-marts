import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CredentialConsumerBinding } from '../../credentials/entities/credential-consumer-binding.entity';
import {
  BIGQUERY_OAUTH_TYPE,
  type BigQueryOAuthCredentials,
} from '../../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import type { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import { DataStorageCredentialService } from '../data-storage-credential.service';
import { GoogleOAuthClientService } from '../google-oauth/google-oauth-client.service';
import { GoogleOAuthConfigService } from '../google-oauth/google-oauth-config.service';
import { StorageCredentialUnavailableException } from '../../exceptions/storage-credential-unavailable.exception';
import { ACTIVE_STORAGE_BINDING } from './legacy-storage-credential-sql';

/** Every read of `data_storage_credentials` and `data_storage.credentialId`; removed with them. */
@Injectable()
export class LegacyStorageCredentialReader {
  constructor(
    @InjectRepository(DataStorage)
    private readonly storages: Repository<DataStorage>,
    private readonly oldRows: DataStorageCredentialService,
    private readonly googleOAuthClient: GoogleOAuthClientService,
    private readonly googleOAuthConfig: GoogleOAuthConfigService
  ) {}

  hasOldKey(storage: Pick<DataStorage, 'credentialId'>): boolean {
    return Boolean(storage.credentialId);
  }

  /** The adapter credentials of an unbound Storage's old key row. */
  async resolve(storage: DataStorage): Promise<DataStorageCredentials> {
    const credential = await this.loadOldRow(storage);

    if (!credential) {
      throw new StorageCredentialUnavailableException(
        'This Storage has no Credential. Select one in the Storage settings.',
        false
      );
    }

    if (credential.type === StorageCredentialType.GOOGLE_OAUTH) {
      const oauth2Client = await this.googleOAuthClient.getStorageOAuth2Client(storage.id);
      return {
        type: BIGQUERY_OAUTH_TYPE,
        oauth2Client,
        oauthClientId: this.googleOAuthConfig.getStorageClientId(),
      } satisfies BigQueryOAuthCredentials;
    }

    return credential.credentials as DataStorageCredentials;
  }

  /** The identity object the old row of an unbound Storage carries. */
  oldKeyIdentity(storage: DataStorage): CredentialIdentity | null {
    return storage.credential?.identity ?? null;
  }

  /** The account each listed Storage's old key row names; a Storage without a row is absent. */
  async identities(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>> {
    if (storageIds.length === 0) return new Map();
    const storages = await this.storages.find({
      where: { id: In([...storageIds]), projectId, deletedAt: IsNull() },
      select: { id: true, credentialId: true, credential: { id: true, identity: true } },
      relations: { credential: true },
      loadEagerRelations: false,
    });
    return new Map(
      storages.flatMap(({ id, credential }) => {
        if (!credential) return [];
        const identity = credential.identity;
        const value =
          identity?.clientEmail ?? identity?.email ?? identity?.username ?? identity?.accessKeyId;
        return [[id, value ?? null] as const];
      })
    );
  }

  /** In the caller's transaction, moves the Storage's old key row to the Storage's new project. */
  async moveOldRow(storage: DataStorage, toProjectId: string): Promise<void> {
    if (!storage.credential) return;
    await this.storages.manager.update(DataStorageCredential, storage.credential.id, {
      projectId: toProjectId,
    });
  }

  /** The listed Storages a run resolves from the old key, by the predicate of STORAGES_ON_OLD_KEY_SQL. */
  async storageIdsOnOldKey(storageIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (storageIds.length === 0) return new Set();
    const rows = await this.storages
      .createQueryBuilder('storage')
      .select('storage.id', 'id')
      .innerJoin(
        DataStorageCredential,
        'oldKey',
        'oldKey.id = storage.credentialId AND oldKey.deletedAt IS NULL'
      )
      .leftJoin(
        CredentialConsumerBinding,
        'binding',
        `${ACTIVE_STORAGE_BINDING} AND binding.projectId = storage.projectId`
      )
      .where('storage.id IN (:...ids)', { ids: [...storageIds] })
      .andWhere('binding.id IS NULL')
      .getRawMany<{ id: string }>();
    return new Set(rows.map(row => row.id));
  }

  // Reads `storage.credential` populated by the eager OneToOne; if it's missing while
  // `credentialId` is set, refetches the credential explicitly. Guards against TypeORM
  // hydration glitches where eager + manual `relations` overlap can leave the field null
  // (observed after typeorm 0.3.29 / PR #11267 changed setValue to mergeDeep).
  private async loadOldRow(storage: DataStorage): Promise<DataStorageCredential | null> {
    if (storage.credential) {
      return storage.credential;
    }
    if (!storage.credentialId) {
      return null;
    }
    return this.oldRows.getById(storage.credentialId);
  }
}
