import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../data-destination-credentials.type';
import { DataDestinationCredentialsProcessor } from '../interfaces/data-destination-credentials-processor.interface';
import { DATA_DESTINATION_CREDENTIALS_PROCESSOR_RESOLVER } from '../data-destination-providers';

/**
 * Facade for processing data destination credentials
 * Orchestrates different credential processors based on destination type
 */
@Injectable()
export class DataDestinationCredentialsProcessorFacade {
  constructor(
    @Inject(DATA_DESTINATION_CREDENTIALS_PROCESSOR_RESOLVER)
    private readonly resolver: TypeResolver<
      DataDestinationType,
      DataDestinationCredentialsProcessor
    >
  ) {}

  /**
   * Processes credentials for a specific destination type
   * If no specific processor is found, returns credentials as-is for backward compatibility
   *
   * @param type - The destination type to process credentials for
   * @param inputCredentials - The input credentials from the user
   * @param existingCredentials - Existing credentials for updates (optional)
   * @returns Processed credentials ready for saving
   */
  async processCredentials(
    type: DataDestinationType,
    inputCredentials: DataDestinationCredentials,
    existingCredentials?: DataDestinationCredentials
  ): Promise<DataDestinationCredentials> {
    const processor = await this.resolver.tryResolve(type);

    if (processor) {
      return processor.processCredentials(inputCredentials, existingCredentials);
    }

    return inputCredentials;
  }
}
