import { Injectable, Logger } from '@nestjs/common';
import { DataMartSchemaParserFacade } from '../data-storage-types/facades/data-mart-schema-parser-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class UpdateDataMartSchemaService {
  private readonly logger = new Logger(UpdateDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly schemaParserFacade: DataMartSchemaParserFacade,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: UpdateDataMartSchemaCommand): Promise<DataMartDto> {
    this.logger.debug(`Updating data mart ${command.id} schema ${command.schema}`);
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId
    );

    dataMart.schema = await this.schemaParserFacade.validateAndParse(
      command.schema,
      dataMart.storage.type
    );
    await this.dataMartService.save(dataMart);

    if (dataMart.definition) {
      try {
        await this.dataMartService.actualizeSchemaInEntity(dataMart);
        await this.dataMartService.save(dataMart);
      } catch (error) {
        this.logger.warn('Failed to actualize schema on update', error);
      }
    }

    this.logger.debug(`Data mart ${command.id} schema updated`);
    return this.mapper.toDomainDto(dataMart);
  }
}
