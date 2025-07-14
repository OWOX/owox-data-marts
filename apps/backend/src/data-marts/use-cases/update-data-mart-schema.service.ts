import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
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

    const schemaOpt = DataMartSchemaSchema.safeParse(command.schema);
    if (!schemaOpt.success) {
      throw new BusinessViolationException(
        `Failed to update schema: ${schemaOpt.error.errors.map(e => e.message).join(',\n')}`
      );
    }

    dataMart.schema = schemaOpt.data;

    if (dataMart.definition) {
      await this.dataMartService.actualizeSchemaInEntity(dataMart);
    }

    await this.dataMartService.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
