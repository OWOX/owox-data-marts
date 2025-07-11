import { Injectable, Logger } from '@nestjs/common';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class UpdateDataMartSchemaService {
  private readonly logger = new Logger(UpdateDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: UpdateDataMartSchemaCommand): Promise<DataMartDto> {
    this.logger.debug(`Updating data mart ${command.id} schema ${command.schema}`);
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId,
      command.userId
    );

    dataMart.schema = command.schema;

    await this.dataMartService.actualizeSchemaInEntity(dataMart);
    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
