import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import { OwoxProducer } from '@owox/internal-helpers';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { RunType } from '../../common/scheduler/shared/types';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';

@Injectable()
export class PublishDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly connectorExecutionService: ConnectorExecutionService
  ) {}

  async run(command: PublishDataMartCommand): Promise<DataMartDto> {
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
        throw new ForbiddenException('You do not have permission to publish this DataMart');
      }
    }

    if (dataMart.status !== DataMartStatus.DRAFT) {
      throw new BusinessViolationException(`DataMart is not in ${DataMartStatus.DRAFT} status`);
    }

    if (!dataMart.definition || !dataMart.definitionType) {
      throw new BusinessViolationException('DataMart has no definition');
    }

    if (dataMart.definitionType !== DataMartDefinitionType.SQL) {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
    }

    const previousStatus = dataMart.status;
    dataMart.status = DataMartStatus.PUBLISHED;

    await this.dataMartService.save(dataMart);

    if (dataMart.definitionType === DataMartDefinitionType.CONNECTOR) {
      await this.connectorExecutionService.run(dataMart, command.createdById, RunType.manual, {
        runType: 'INCREMENTAL',
      });
    }

    await this.producer.produceEvent(
      new DataMartPublishedEvent(
        dataMart.id,
        command.projectId,
        dataMart.createdById,
        previousStatus
      )
    );

    return this.mapper.toDomainDto(dataMart);
  }
}
