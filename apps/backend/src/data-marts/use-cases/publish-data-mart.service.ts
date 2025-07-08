import { Injectable } from '@nestjs/common';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { Repository } from 'typeorm';
import { DataMartService } from '../services/data-mart.service';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';

@Injectable()
export class PublishDataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
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

    dataMart.status = DataMartStatus.PUBLISHED;
    await this.dataMartRepository.save(dataMart);
    return this.mapper.toDomainDto(dataMart);
  }
}
