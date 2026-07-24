import { Injectable, Logger } from '@nestjs/common';
import { DataDestinationCredentials } from '../../../data-destination-credentials.type';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import {
  DataDestinationCredentialsValidator,
  ValidationResult,
} from '../../../interfaces/data-destination-credentials-validator.interface';
import { EmailCredentialsSchema } from '../../email/schemas/email-credentials.schema';
import { GoogleChatCredentialsSchema } from '../schemas/google-chat-credentials.schema';

@Injectable()
export class GoogleChatCredentialsValidator implements DataDestinationCredentialsValidator {
  private readonly logger = new Logger(GoogleChatCredentialsValidator.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  async validate(credentials: DataDestinationCredentials): Promise<ValidationResult> {
    const webhookCredentials = GoogleChatCredentialsSchema.safeParse(credentials);
    const emailCredentials = EmailCredentialsSchema.safeParse(credentials);
    if (!webhookCredentials.success && !emailCredentials.success) {
      this.logger.warn('Invalid Google Chat credentials format', webhookCredentials.error);
      return new ValidationResult(false, 'Invalid Google Chat credentials', {
        errors: webhookCredentials.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
