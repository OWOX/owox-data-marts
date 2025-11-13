import { Injectable, Logger } from '@nestjs/common';

import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../../data-destination-credentials.type';
import {
  DataDestinationCredentialsValidator,
  ValidationResult,
} from '../../../interfaces/data-destination-credentials-validator.interface';
import { EmailCredentialsSchema } from '../schemas/email-credentials.schema';

/**
 * Abstract class for validating email credentials for a data destination.
 * This class implements the `DataDestinationCredentialsValidator` interface and provides
 * a base structure for validating email credentials using a specific schema.
 *
 * Subclasses must define the abstract properties `type` and `logger`.
 */
abstract class BaseEmailCredentialsValidator implements DataDestinationCredentialsValidator {
  abstract readonly type: DataDestinationType;
  protected abstract readonly logger: Logger;

  async validate(credentials: DataDestinationCredentials): Promise<ValidationResult> {
    const credentialsOpt = EmailCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}

@Injectable()
export class EmailCredentialsValidator extends BaseEmailCredentialsValidator {
  protected readonly logger = new Logger(EmailCredentialsValidator.name);
  readonly type = DataDestinationType.EMAIL;
}

@Injectable()
export class SlackCredentialsValidator extends BaseEmailCredentialsValidator {
  protected readonly logger = new Logger(SlackCredentialsValidator.name);
  readonly type = DataDestinationType.SLACK;
}

@Injectable()
export class MsTeamsCredentialsValidator extends BaseEmailCredentialsValidator {
  protected readonly logger = new Logger(MsTeamsCredentialsValidator.name);
  readonly type = DataDestinationType.MS_TEAMS;
}

@Injectable()
export class GoogleChatCredentialsValidator extends BaseEmailCredentialsValidator {
  protected readonly logger = new Logger(GoogleChatCredentialsValidator.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;
}
