import { Injectable, Logger } from '@nestjs/common';

import { DataDestination } from '../../../entities/data-destination.entity';
import { DataDestinationConfig } from '../../data-destination-config.type';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import {
  DataDestinationAccessValidator,
  ValidationResult,
} from '../../interfaces/data-destination-access-validator.interface';
import { ExcelConfigSchema } from '../schemas/excel-config.schema';

/**
 * Validates the shape of an Excel report configuration, and nothing else.
 *
 * The other validators check that the server can still reach the destination — that a service
 * account can open the spreadsheet, that a webhook still answers. There is nothing to reach
 * here: the add-in pulls its own data with the user's own token, so whether it can read the
 * report is decided when it asks, by the same access rules as every other API call.
 */
@Injectable()
export class ExcelAccessValidator implements DataDestinationAccessValidator {
  private readonly logger = new Logger(ExcelAccessValidator.name);
  readonly type = DataDestinationType.EXCEL;

  async validate(
    destinationConfig: DataDestinationConfig,
    _dataDestination: DataDestination
  ): Promise<ValidationResult> {
    const configOpt = ExcelConfigSchema.safeParse(destinationConfig);
    if (!configOpt.success) {
      this.logger.warn('Invalid configuration format', configOpt.error);
      return new ValidationResult(false, 'Invalid configuration', {
        errors: configOpt.error.errors,
      });
    }

    return new ValidationResult(true);
  }
}
