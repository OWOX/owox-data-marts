import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class PublishDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: PublishDataMartCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId,
      command.userId
    );

    if (dataMart.status !== DataMartStatus.DRAFT) {
      throw new BusinessViolationException(`DataMart is not in ${DataMartStatus.DRAFT} status`);
    }

    if (!dataMart.definition || !dataMart.definitionType) {
      throw new BusinessViolationException('DataMart has no definition');
    }

    await this.definitionValidatorFacade.checkIsValid(dataMart);
    await this.dataMartService.actualizeSchemaInEntity(dataMart);

    dataMart.status = DataMartStatus.PUBLISHED;

    await this.dataMartService.save(dataMart);
    return this.mapper.toDomainDto(dataMart);
  }
}
