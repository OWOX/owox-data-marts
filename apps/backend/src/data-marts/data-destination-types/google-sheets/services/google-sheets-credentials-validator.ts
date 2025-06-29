import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-credentials.type';
import { Injectable, Logger } from '@nestjs/common';
import {
  DataDestinationCredentialsValidator,
  ValidationResult,
} from '../../interfaces/data-destination-credentials-validator.interface';
import { GoogleSheetsCredentialsSchema } from '../schemas/google-sheets-credentials.schema';
import { GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';

/**
 * Validator for Google Sheets credentials
 * Validates that the provided credentials are valid for Google Sheets API access
 */
@Injectable()
export class GoogleSheetsCredentialsValidator implements DataDestinationCredentialsValidator {
  private readonly logger = new Logger(GoogleSheetsCredentialsValidator.name);
  readonly type = DataDestinationType.GOOGLE_SHEETS;

  /**
   * Validates Google Sheets credentials
   *
   * @param credentials - Credentials to validate
   * @returns Validation result with success status and optional error details
   */
  async validate(credentials: DataDestinationCredentials): Promise<ValidationResult> {
    const credentialsOpt = GoogleSheetsCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    try {
      const isValid = await GoogleSheetsApiAdapter.validateCredentials(credentialsOpt.data);

      if (!isValid) {
        this.logger.warn('Invalid credentials');
        return new ValidationResult(false, 'Invalid credentials');
      }

      return new ValidationResult(true);
    } catch (error) {
      this.logger.warn('Invalid credentials', error);
      return new ValidationResult(false, 'Invalid credentials');
    }
  }
}
