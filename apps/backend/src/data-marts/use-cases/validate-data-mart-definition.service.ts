import { Injectable, ForbiddenException } from '@nestjs/common';
import { ValidateDataMartDefinitionCommand } from '../dto/domain/validate-data-mart-definition.command';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartService } from '../services/data-mart.service';
import { ValidationResult } from '../data-storage-types/interfaces/data-mart-validator.interface';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class ValidateDataMartDefinitionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ValidateDataMartDefinitionCommand): Promise<ValidationResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canSee = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.SEE,
        command.projectId
      );
      if (!canSee) {
        throw new ForbiddenException('You do not have access to this DataMart');
      }
    }

    return await this.definitionValidatorFacade.validate(dataMart);
  }
}
