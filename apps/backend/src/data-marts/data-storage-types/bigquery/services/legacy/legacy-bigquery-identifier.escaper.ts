import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../../interfaces/identifier-escaper.interface';
import { escapeBigQueryIdentifier } from '../../utils/bigquery-identifier.utils';

@Injectable()
export class LegacyBigQueryIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  escapeIdentifier(identifier: string): string {
    return escapeBigQueryIdentifier(identifier);
  }
}
