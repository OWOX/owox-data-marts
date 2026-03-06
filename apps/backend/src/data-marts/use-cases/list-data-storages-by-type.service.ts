import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import { toHumanReadable } from '../data-storage-types/enums/data-storage-type.enum';
import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { ListDataStoragesByTypeItemDto } from '../dto/domain/list-data-storages-by-type-item.dto';

@Injectable()
export class ListDataStoragesByTypeService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>
  ) {}

  async run(command: ListDataStoragesByTypeCommand): Promise<ListDataStoragesByTypeItemDto[]> {
    const { projectId } = command;

    const storages = await this.dataStorageRepo.find({
      where: {
        projectId,
        type: command.type,
        credentialId: Not(IsNull()),
      },
    });

    if (storages.length === 0) {
      return [];
    }

    const ids = storages.map(s => s.id);

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

    return storages.map(s => ({
      id: s.id,
      title: s.title ?? toHumanReadable(s.type),
      dataMartName: nameMap.get(s.id) ?? null,
      identity: s.credential?.identity ?? null,
    }));
  }
}
