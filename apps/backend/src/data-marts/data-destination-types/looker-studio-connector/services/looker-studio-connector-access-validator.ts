import { Injectable, Logger } from '@nestjs/common';

import { DataDestination } from '../../../entities/data-destination.entity';
import { DataDestinationConfig } from '../../data-destination-config.type';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import {
  DataDestinationAccessValidator,
  ValidationResult,
} from '../../interfaces/data-destination-access-validator.interface';
import { LookerStudioConnectorConfigSchema } from '../schemas/looker-studio-connector-config.schema';
import { LookerStudioConnectorCredentialsSchema } from '../schemas/looker-studio-connector-credentials.schema';

@Injectable()
export class LookerStudioConnectorAccessValidator implements DataDestinationAccessValidator {
  private readonly logger = new Logger(LookerStudioConnectorAccessValidator.name);
  readonly type = DataDestinationType.LOOKER_STUDIO;

  async validate(
    destinationConfig: DataDestinationConfig,
    dataDestination: DataDestination
  ): Promise<ValidationResult> {
    const credentials = dataDestination.credentials;

    const credentialsOpt = LookerStudioConnectorCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const configOpt = LookerStudioConnectorConfigSchema.safeParse(destinationConfig);
    if (!configOpt.success) {
      this.logger.warn('Invalid configuration format', configOpt.error);
      return new ValidationResult(false, 'Invalid configuration', {
        errors: configOpt.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
