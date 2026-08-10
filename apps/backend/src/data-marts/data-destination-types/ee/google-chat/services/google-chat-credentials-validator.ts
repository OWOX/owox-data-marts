import { Injectable, Logger } from '@nestjs/common';
import { DataDestinationCredentials } from '../../../data-destination-credentials.type';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import {
  DataDestinationCredentialsValidator,
  ValidationResult,
} from '../../../interfaces/data-destination-credentials-validator.interface';
import {
  EmailCredentialsSchema,
  EmailCredentialsType,
} from '../../email/schemas/email-credentials.schema';
import { GoogleChatCredentialsSchema } from '../schemas/google-chat-credentials.schema';

@Injectable()
export class GoogleChatCredentialsValidator implements DataDestinationCredentialsValidator {
  private readonly logger = new Logger(GoogleChatCredentialsValidator.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  async validate(credentials: DataDestinationCredentials): Promise<ValidationResult> {
    const credentialsValidation =
      credentials.type === EmailCredentialsType
        ? EmailCredentialsSchema.safeParse(credentials)
        : GoogleChatCredentialsSchema.safeParse(credentials);
    if (!credentialsValidation.success) {
      this.logger.warn('Invalid Google Chat credentials format', credentialsValidation.error);
      return new ValidationResult(false, 'Invalid Google Chat credentials', {
        errors: credentialsValidation.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
