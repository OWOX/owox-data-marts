import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DataMartSchemaParserFacade } from '../data-storage-types/facades/data-mart-schema-parser-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class UpdateDataMartSchemaService {
  private readonly logger = new Logger(UpdateDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly schemaParserFacade: DataMartSchemaParserFacade,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: UpdateDataMartSchemaCommand): Promise<DataMartDto> {
    this.logger.debug(`Updating data mart ${command.id} schema ${command.schema}`);
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    dataMart.schema = await this.schemaParserFacade.validateAndParse(
      command.schema,
      dataMart.storage.type
    );
    await this.dataMartService.save(dataMart);

    this.logger.debug(`Data mart ${command.id} schema updated`);
    return this.mapper.toDomainDto(dataMart);
  }
}
