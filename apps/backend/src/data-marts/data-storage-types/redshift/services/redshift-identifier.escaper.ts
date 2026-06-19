import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../interfaces/identifier-escaper.interface';
import { escapeRedshiftIdentifier } from '../utils/redshift-identifier.utils';

@Injectable()
export class RedshiftIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.AWS_REDSHIFT;

  escapeIdentifier(identifier: string): string {
    return escapeRedshiftIdentifier(identifier);
  }
}
