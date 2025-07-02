import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER } from '../data-destination-providers';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { DataDestinationCredentials } from '../data-destination-credentials.type';
import { DataDestinationCredentialsValidator } from '../interfaces/data-destination-credentials-validator.interface';

@Injectable()
export class DataDestinationCredentialsValidatorFacade {
  constructor(
    @Inject(DATA_DESTINATION_CREDENTIALS_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<
      DataDestinationType,
      DataDestinationCredentialsValidator
    >
  ) {}

  async checkCredentials(
    type: DataDestinationType,
    credentials: DataDestinationCredentials
  ): Promise<void> {
    const validator = await this.resolver.resolve(type);
    const validationResult = await validator.validate(credentials);
    if (!validationResult.valid) {
      throw new AccessValidationException(validationResult.errorMessage!, validationResult.reason);
    }
  }
}
