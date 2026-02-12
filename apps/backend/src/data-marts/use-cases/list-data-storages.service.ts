import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import { DataMart } from '../entities/data-mart.entity';

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
      .addSelect('COUNT(DISTINCT dm.id)', 'count')
      .groupBy('s.id')
      .getRawMany<{ storageId: string; count: string }>();

    const countMap = new Map<string, number>(rawCounts.map(r => [r.storageId, Number(r.count)]));

    return dataStorages.map(s => this.mapper.toDomainDto(s, countMap.get(s.id) ?? 0));
  }
}
