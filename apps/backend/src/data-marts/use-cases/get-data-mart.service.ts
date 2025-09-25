import { Injectable } from '@nestjs/common';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';

@Injectable()
export class GetDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);
    return this.mapper.toDomainDto(dataMart);
  }
}
