import { Injectable } from '@nestjs/common';
import { ValidateDataMartDefinitionCommand } from '../dto/domain/validate-data-mart-definition.command';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartService } from '../services/data-mart.service';
import { ValidationResult } from '../data-storage-types/interfaces/data-mart-validator.interface';

@Injectable()
export class ValidateDataMartDefinitionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade
  ) {}

  async run(command: ValidateDataMartDefinitionCommand): Promise<ValidationResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId,
      command.userId
    );

    return await this.definitionValidatorFacade.validate(dataMart);
  }
}
