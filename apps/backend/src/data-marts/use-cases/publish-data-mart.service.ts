import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class PublishDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    private readonly eventDispatcher: OwoxEventDispatcher
  ) {}

  async run(command: PublishDataMartCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

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

    const event = new DataMartPublishedEvent(
      dataMart.id,
      command.projectId,
      dataMart.createdById,
      previousStatus
    );

    await this.eventDispatcher.publish(event);

    return this.mapper.toDomainDto(dataMart);
  }
}
