import { Injectable, Logger } from '@nestjs/common';

import { DataDestination } from '../../../../entities/data-destination.entity';
import { DataDestinationConfig } from '../../../data-destination-config.type';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import {
  DataDestinationAccessValidator,
  ValidationResult,
} from '../../../interfaces/data-destination-access-validator.interface';
import { EmailConfigSchema } from '../schemas/email-config.schema';
import { EmailCredentialsSchema } from '../schemas/email-credentials.schema';

/**
 * Abstract class representing a base validator for email data destination access.
 * This class is intended to validate email configurations and credentials
 * to ensure that they meet the required format and schema.
 *
 * Subclasses should implement specific functionality for logging and define
 * the email-related data destination type.
 */
abstract class BaseEmailAccessValidator implements DataDestinationAccessValidator {
  abstract readonly type: DataDestinationType;
  protected abstract readonly logger: Logger;
  protected abstract readonly credentialsResolver: DataDestinationCredentialsResolver;

  async validate(
    destinationConfig: DataDestinationConfig,
    dataDestination: DataDestination
  ): Promise<ValidationResult> {
    let resolvedCredentials;
    try {
      resolvedCredentials = await this.credentialsResolver.resolve(dataDestination);
    } catch {
      return new ValidationResult(false, 'Credentials are not configured');
    }

    const credentialsOpt = EmailCredentialsSchema.safeParse(resolvedCredentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const configOpt = EmailConfigSchema.safeParse(destinationConfig);
    if (!configOpt.success) {
      this.logger.warn('Invalid configuration format', configOpt.error);
      return new ValidationResult(false, 'Invalid configuration', {
        errors: configOpt.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}

@Injectable()
export class EmailAccessValidator extends BaseEmailAccessValidator {
  protected readonly logger = new Logger(EmailAccessValidator.name);
  readonly type = DataDestinationType.EMAIL;
  constructor(protected readonly credentialsResolver: DataDestinationCredentialsResolver) {
    super();
  }
}

@Injectable()
export class SlackAccessValidator extends BaseEmailAccessValidator {
  protected readonly logger = new Logger(SlackAccessValidator.name);
  readonly type = DataDestinationType.SLACK;
  constructor(protected readonly credentialsResolver: DataDestinationCredentialsResolver) {
    super();
  }
}

@Injectable()
export class MsTeamsAccessValidator extends BaseEmailAccessValidator {
  protected readonly logger = new Logger(MsTeamsAccessValidator.name);
  readonly type = DataDestinationType.MS_TEAMS;
  constructor(protected readonly credentialsResolver: DataDestinationCredentialsResolver) {
    super();
  }
}

@Injectable()
export class GoogleChatAccessValidator extends BaseEmailAccessValidator {
  protected readonly logger = new Logger(GoogleChatAccessValidator.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;
  constructor(protected readonly credentialsResolver: DataDestinationCredentialsResolver) {
    super();
  }
}
