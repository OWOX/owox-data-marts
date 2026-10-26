import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import {
  DataStorageType,
  toHumanReadable,
} from '../data-storage-types/enums/data-storage-type.enum';
import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { StorageCredentialBindingService } from '../data-storage-types/storage-credential-binding.service';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import { ListDataStoragesByTypeItemDto } from '../dto/domain/list-data-storages-by-type-item.dto';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import type { CredentialIdentity } from '../entities/credential-identity.type';

@Injectable()
export class ListDataStoragesByTypeService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly storageCredentials: StorageCredentialBindingService,
    private readonly legacy: LegacyStorageCredentialReader
  ) {}

  async run(command: ListDataStoragesByTypeCommand): Promise<ListDataStoragesByTypeItemDto[]> {
    const { projectId } = command;

    const candidates = await this.dataStorageRepo.find({
      where: { projectId, type: command.type },
    });
    const bound = await this.storageCredentials.findBoundStorageIds(
      projectId,
      candidates.map(s => s.id)
    );
    const storages = candidates.filter(s => this.legacy.hasOldKey(s) || bound.has(s.id));

    if (storages.length === 0) {
      return [];
    }

    const ids = storages.map(s => s.id);
    // A bound Credential's identity needs SEE on it, and a plugin never gets it.
    const summaries: ReadonlyMap<string, StorageCredentialSummary> = command.isPluginCall
      ? new Map()
      : await this.storageCredentials.summarizeForStorages({
          projectId,
          userId: command.userId,
          roles: command.roles,
          storages,
        });

    const rawRows: { storageId: string; dataMartName: string | null }[] = await this.dataMartRepo
      .createQueryBuilder('dm')
      .leftJoin('dm.storage', 's')
      .where('s.id IN (:...ids)', { ids })
      .andWhere('dm.projectId = :projectId', { projectId })
      .andWhere('dm.deletedAt IS NULL')
      .select('s.id', 'storageId')
      .addSelect('MIN(dm.title)', 'dataMartName')
      .groupBy('s.id')
      .getRawMany();

    const nameMap = new Map<string, string | null>(rawRows.map(r => [r.storageId, r.dataMartName]));

    return storages.map(s => {
      const summary = summaries.get(s.id);
      return {
        id: s.id,
        title: s.title ?? toHumanReadable(s.type),
        dataMartName: nameMap.get(s.id) ?? null,
        identity: bound.has(s.id)
          ? toIdentity(s.type, summary?.access === 'visible' ? summary.identity : null)
          : this.legacy.oldKeyIdentity(s),
      };
    });
  }
}

/** A Credential's identity in the object shape this response has always carried. */
function toIdentity(type: DataStorageType, value: string | null): CredentialIdentity | null {
  if (!value) return null;
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return value.endsWith('.gserviceaccount.com') ? { clientEmail: value } : { email: value };
    case DataStorageType.SNOWFLAKE:
      return { username: value };
    case DataStorageType.AWS_ATHENA:
    case DataStorageType.AWS_REDSHIFT:
      return { accessKeyId: value };
    default:
      return null;
  }
}
