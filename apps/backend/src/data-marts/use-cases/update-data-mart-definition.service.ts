import { Injectable } from '@nestjs/common';
import { DataMart } from '../entities/data-mart.entity';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';

import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { Repository } from 'typeorm';
import { DataMartService } from '../services/data-mart.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';

@Injectable()
export class UpdateDataMartDefinitionService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: UpdateDataMartDefinitionCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId,
      command.userId
    );

    if (dataMart.definitionType && dataMart.definitionType !== command.definitionType) {
      throw new BusinessViolationException('DataMart already has definition');
    }
    dataMart.definitionType = command.definitionType;
    dataMart.definition = command.definition;

    await this.definitionValidatorFacade.checkIsValid(dataMart);
    await this.dataMartRepository.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
