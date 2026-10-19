import { Transactional } from 'typeorm-transactional';
import { DataMart } from '../entities/data-mart.entity';
import {
  Injectable,
  Logger,
  ForbiddenException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
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

    if (command.expectedRevision !== undefined && dataMart.revision !== command.expectedRevision)
      throw new ConflictException('Data Mart configuration changed');

    if (
      command.userId &&
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        dataMart.storage.id,
        Action.USE,
        command.projectId
      ))
    )
      throw new ForbiddenException('Storage USE permission is required');

    try {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
      await this.dataMartService.actualizeSchemaInEntity(dataMart);
      await this.persist(dataMart, command);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BusinessViolationException(
        'Schema actualization failed; check the storage and definition'
      );
    }

    this.logger.debug(`Data mart ${command.id} schema actualized`);
    return this.mapper.toDomainDto(dataMart);
  }
  @Transactional()
  private async persist(dataMart: DataMart, command: ActualizeDataMartSchemaCommand) {
    await this.dataMartService.lockConfigurationReferences(command.projectId);
    if (command.userId) {
      for (const [type, id, action] of [
        [EntityType.DATA_MART, command.id, Action.EDIT],
        [EntityType.STORAGE, dataMart.storage.id, Action.USE],
      ] as const) {
        if (
          !(await this.accessDecisionService.canAccess(
            command.userId,
            command.roles,
            type,
            id,
            action,
            command.projectId
          ))
        )
          throw new ForbiddenException('Access changed during schema actualization');
      }
    }
    await this.dataMartService.saveActualizedSchema(dataMart);
  }
}
