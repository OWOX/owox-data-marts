import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { AuthorizationContext } from '../../common/authorization-context/authorization.context';

@Injectable()
export class ListDataStoragesService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>,
    private readonly mapper: DataStorageMapper
  ) {}

  async run(context: AuthorizationContext): Promise<DataStorageDto[]> {
    const entities = await this.dataStorageRepo.find({
      where: { projectId: context.projectId },
    });
    return entities.map(entity => this.mapper.toDomainDto(entity));
  }
}
