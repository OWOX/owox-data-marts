import {
  DataDestinationAccessValidator,
  ValidationResult,
} from '../../interfaces/data-destination-access-validator.interface';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestinationConfig } from '../../data-destination-config.type';
import { Injectable, Logger } from '@nestjs/common';
import { GoogleSheetsCredentialsSchema } from '../schemas/google-sheets-credentials.schema';
import { GoogleSheetsConfigSchema } from '../schemas/google-sheets-config.schema';
import { DataDestination } from '../../../entities/data-destination.entity';
import { GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';

/**
 * Validator for Google Sheets access
 * Validates that the provided credentials and configuration allow access to the specified sheet
 */
@Injectable()
export class GoogleSheetsAccessValidator implements DataDestinationAccessValidator {
  private readonly logger = new Logger(GoogleSheetsAccessValidator.name);
  readonly type = DataDestinationType.GOOGLE_SHEETS;

  /**
   * Validates access to a Google Sheets destination
   *
   * @param destinationConfig - Configuration for the Google Sheets destination
   * @param dataDestination - Data destination entity containing credentials
   * @returns Validation result with success status and optional error details
   */
  async validate(
    destinationConfig: DataDestinationConfig,
    dataDestination: DataDestination
  ): Promise<ValidationResult> {
    const credentials = dataDestination.credentials;

    const credentialsOpt = GoogleSheetsCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials format', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const configOpt = GoogleSheetsConfigSchema.safeParse(destinationConfig);
    if (!configOpt.success) {
      this.logger.warn('Invalid configuration format', configOpt.error);
      return new ValidationResult(false, 'Invalid configuration', {
        errors: configOpt.error.errors,
      });
    }

    try {
      const adapter = new GoogleSheetsApiAdapter(credentialsOpt.data);
      const spreadsheet = await adapter.getSpreadsheet(
        configOpt.data.spreadsheetId,
        'properties.title,sheets.properties.sheetId,sheets.properties.title'
      );
      const sheet = adapter.findSheetById(spreadsheet, configOpt.data.sheetId);

      if (!spreadsheet?.properties?.title || !sheet || !sheet?.properties?.title) {
        this.logger.warn(
          `Failed to find sheet ${configOpt.data.sheetId} in spreadsheet ${configOpt.data.spreadsheetId}`
        );
        return new ValidationResult(
          false,
          `Failed to find sheet ${configOpt.data.sheetId} in spreadsheet ${configOpt.data.spreadsheetId}`
        );
      }

      return new ValidationResult(true, undefined, undefined, {
        spreadsheetTitle: spreadsheet.properties?.title,
        sheetTitle: sheet.properties?.title,
      });
    } catch (error) {
      this.logger.warn('Access check failed', error);
      return new ValidationResult(false, 'Access check failed');
    }
  }
}
