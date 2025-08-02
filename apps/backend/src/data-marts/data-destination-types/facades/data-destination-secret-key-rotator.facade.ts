import { Inject, Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../data-destination-credentials.type';
import { DataDestinationSecretKeyRotator } from '../interfaces/data-destination-secret-key-rotator.interface';
import { DATA_DESTINATION_SECRET_KEY_ROTATOR_RESOLVER } from '../data-destination-providers';

/**
 * Facade for rotating secret keys in data destination credentials
 */
@Injectable()
export class DataDestinationSecretKeyRotatorFacade {
  constructor(
    @Inject(DATA_DESTINATION_SECRET_KEY_ROTATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataDestinationType, DataDestinationSecretKeyRotator>
  ) {}

  /**
   * Rotates secret key for a specific destination type
   *
   * @param type - The destination type
   * @param credentials - Current credentials
   * @returns Credentials with rotated secret key
   */
  async rotateSecretKey(
    type: DataDestinationType,
    credentials: DataDestinationCredentials
  ): Promise<DataDestinationCredentials> {
    const rotator = await this.resolver.resolve(type);

    if (!rotator) {
      throw new BusinessViolationException(
        `Secret key rotation not supported for destination type: ${type}`
      );
    }

    return rotator.rotateSecretKey(credentials);
  }
}
