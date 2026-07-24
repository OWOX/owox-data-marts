import { Injectable, Logger } from '@nestjs/common';
import { DataDestination } from '../../../../entities/data-destination.entity';
import { DataDestinationConfig } from '../../../data-destination-config.type';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import {
  DataDestinationAccessValidator,
  ValidationResult,
} from '../../../interfaces/data-destination-access-validator.interface';
import { EmailConfigInputSchema } from '../../email/schemas/email-config.schema';
import { EmailCredentialsSchema } from '../../email/schemas/email-credentials.schema';
import { GoogleChatCredentialsSchema } from '../schemas/google-chat-credentials.schema';

@Injectable()
export class GoogleChatAccessValidator implements DataDestinationAccessValidator {
  private readonly logger = new Logger(GoogleChatAccessValidator.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  constructor(private readonly credentialsResolver: DataDestinationCredentialsResolver) {}

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

    const webhookCredentials = GoogleChatCredentialsSchema.safeParse(resolvedCredentials);
    const emailCredentials = EmailCredentialsSchema.safeParse(resolvedCredentials);
    if (!webhookCredentials.success && !emailCredentials.success) {
      this.logger.warn('Invalid Google Chat credentials format', webhookCredentials.error);
      return new ValidationResult(false, 'Invalid Google Chat credentials', {
        errors: webhookCredentials.error.errors,
      });
    }

    const config = EmailConfigInputSchema.safeParse(destinationConfig);
    if (!config.success) {
      this.logger.warn('Invalid Google Chat report configuration', config.error);
      return new ValidationResult(false, 'Invalid configuration', {
        errors: config.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
