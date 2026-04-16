import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class ActualizeDataMartSchemaService {
  private readonly logger = new Logger(ActualizeDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ActualizeDataMartSchemaCommand): Promise<DataMartDto> {
    this.logger.debug(`Actualizing data mart ${command.id} schema...`);
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

    try {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
      await this.dataMartService.actualizeSchemaInEntity(dataMart);
      await this.dataMartService.save(dataMart);
    } catch (error) {
      throw new BusinessViolationException(error.message);
    }

    this.logger.debug(`Data mart ${command.id} schema actualized`);
    return this.mapper.toDomainDto(dataMart);
  }
}
