import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-credentials.type';
import { Injectable, Logger } from '@nestjs/common';
import {
  DataDestinationCredentialsValidator,
  ValidationResult,
} from '../../interfaces/data-destination-credentials-validator.interface';
import { LookerStudioConnectorCredentialsSchema } from '../schemas/looker-studio-connector-credentials.schema';

@Injectable()
export class LookerStudioConnectorCredentialsValidator
  implements DataDestinationCredentialsValidator
{
  private readonly logger = new Logger(LookerStudioConnectorCredentialsValidator.name);
  readonly type = DataDestinationType.LOOKER_STUDIO;

  async validate(credentials: DataDestinationCredentials): Promise<ValidationResult> {
    const credentialsOpt = LookerStudioConnectorCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
