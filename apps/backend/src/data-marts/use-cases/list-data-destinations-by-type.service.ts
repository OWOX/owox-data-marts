import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { ListDataDestinationsByTypeCommand } from '../dto/domain/list-data-destinations-by-type.command';
import { ListDataDestinationsByTypeItemDto } from '../dto/domain/list-data-destinations-by-type-item.dto';

@Injectable()
export class ListDataDestinationsByTypeService {
  constructor(
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepo: Repository<DataDestination>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>
  ) {}

  async run(
    command: ListDataDestinationsByTypeCommand
  ): Promise<ListDataDestinationsByTypeItemDto[]> {
    const { projectId } = command;

    const destinations = await this.dataDestinationRepo.find({
      where: {
        projectId,
        type: command.type,
        credentialId: Not(IsNull()),
      },
    });

    if (destinations.length === 0) {
      return [];
    }

    const ids = destinations.map(d => d.id);

    const rawRows = await this.reportRepo
      .createQueryBuilder('r')
      .leftJoin('r.dataDestination', 'dd')
      .leftJoin('r.dataMart', 'dm')
      .where('dd.id IN (:...ids)', { ids })
      .andWhere('dm.projectId = :projectId', { projectId: command.projectId })
      .andWhere('dm.deletedAt IS NULL')
      .select('dd.id', 'destinationId')
      .addSelect('MIN(dm.title)', 'dataMartName')
      .groupBy('dd.id')
      .getRawMany<{ destinationId: string; dataMartName: string | null }>();

    const nameMap = new Map<string, string | null>(
      rawRows.map(r => [r.destinationId, r.dataMartName])
    );

    return destinations.map(d => ({
      id: d.id,
      title: d.title,
      dataMartName: nameMap.get(d.id) ?? null,
      identity: d.credential?.identity ?? null,
    }));
  }
}
