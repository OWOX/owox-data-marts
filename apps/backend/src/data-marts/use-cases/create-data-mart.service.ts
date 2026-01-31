import { Injectable } from '@nestjs/common';
import { DataStorageService } from '../services/data-storage.service';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class CreateDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataStorageService: DataStorageService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: CreateDataMartCommand): Promise<DataMartDto> {
    const dataStorage = await this.dataStorageService.getByIdAndProjectId(
      command.projectId,
      command.storageId
    );

    const dataMart = this.dataMartService.create({
      title: command.title,
      projectId: command.projectId,
      createdById: command.userId,
      storage: dataStorage,
    });

    const newDataMart = await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(newDataMart);
  }
}
