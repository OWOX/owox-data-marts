import { Injectable, Logger } from '@nestjs/common';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class ActualizeDataMartSchemaService {
  private readonly logger = new Logger(ActualizeDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: ActualizeDataMartSchemaCommand): Promise<DataMartDto> {
    this.logger.debug(`Actualizing data mart ${command.id} schema...`);
    const dataMartWithActualizedSchema = await this.dataMartService.actualizeSchema(
      command.id,
      command.projectId,
      command.userId
    );
    this.logger.debug(`Data mart ${command.id} schema actualized`);
    return this.mapper.toDomainDto(dataMartWithActualizedSchema);
  }
}
