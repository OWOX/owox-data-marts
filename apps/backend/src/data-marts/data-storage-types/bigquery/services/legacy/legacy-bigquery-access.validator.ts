import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryAccessValidator } from '../bigquery-access.validator';

@Injectable()
export class LegacyBigQueryAccessValidator extends BigQueryAccessValidator {
  readonly logger = new Logger(LegacyBigQueryAccessValidator.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}
