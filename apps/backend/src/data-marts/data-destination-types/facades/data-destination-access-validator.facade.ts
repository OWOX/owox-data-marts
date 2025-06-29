import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationAccessValidator } from '../interfaces/data-destination-access-validator.interface';
import { DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER } from '../data-destination-providers';
import { DataDestinationConfig } from '../data-destination-config.type';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { DataDestination } from '../../entities/data-destination.entity';

@Injectable()
export class DataDestinationAccessValidatorFacade {
  constructor(
    @Inject(DATA_DESTINATION_ACCESS_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataDestinationType, DataDestinationAccessValidator>
  ) {}

  async checkAccess(
    type: DataDestinationType,
    destinationConfig: DataDestinationConfig,
    dataDestination: DataDestination
  ): Promise<void> {
    const validationResult = await this.resolver
      .resolve(type)
      .validate(destinationConfig, dataDestination);
    if (!validationResult.valid) {
      throw new AccessValidationException(validationResult.errorMessage!, validationResult.reason);
    }
  }
}
