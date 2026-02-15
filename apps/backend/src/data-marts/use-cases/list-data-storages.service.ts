import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';

@Injectable()
export class ListDataStoragesService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly mapper: DataStorageMapper
  ) {}

  async run(command: ListDataStoragesCommand): Promise<DataStorageDto[]> {
    const dataStorages = await this.dataStorageRepo.find({
      where: { projectId: command.projectId },
    });

    if (dataStorages.length === 0) {
      return [];
    }

    const ids = dataStorages.map(s => s.id);

    const rawCounts = await this.dataMartRepo
      .createQueryBuilder('dm')
      .leftJoin('dm.storage', 's')
      .where('s.id IN (:...ids)', { ids })
      .andWhere('dm.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dm.deletedAt IS NULL')
      .select('s.id', 'storageId')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN dm.status = :publishedStatus THEN dm.id END)',
        'publishedCount'
      )
      .addSelect('COUNT(DISTINCT CASE WHEN dm.status = :draftStatus THEN dm.id END)', 'draftsCount')
      .setParameters({
        publishedStatus: DataMartStatus.PUBLISHED,
        draftStatus: DataMartStatus.DRAFT,
      })
      .groupBy('s.id')
      .getRawMany<{ storageId: string; publishedCount: string; draftsCount: string }>();

    const countMap = new Map(
      rawCounts.map(r => [
        r.storageId,
        { published: Number(r.publishedCount), drafts: Number(r.draftsCount) },
      ])
    );

    return dataStorages.map(s => {
      const counts = countMap.get(s.id);
      return this.mapper.toDomainDto(s, counts?.published ?? 0, counts?.drafts ?? 0);
    });
  }
}
