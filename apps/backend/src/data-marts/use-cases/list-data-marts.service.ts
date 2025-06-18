import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';

@Injectable()
export class ListDataMartsService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: ListDataMartsCommand): Promise<DataMartDto[]> {
    const dataMarts = await this.dataMartRepo.find({
      where: { projectId: command.projectId, createdById: command.userId },
    });
    return this.mapper.toDomainDtoList(dataMarts);
  }
}
