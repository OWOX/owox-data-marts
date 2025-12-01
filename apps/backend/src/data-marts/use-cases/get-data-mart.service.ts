import { Injectable } from '@nestjs/common';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartService } from '../services/data-mart.service';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const userProjection = await this.userProjectionsFetcherService.fetchUserProjection(
      dataMart.createdById
    );

    return this.mapper.toDomainDto(dataMart, undefined, userProjection);
  }
}
