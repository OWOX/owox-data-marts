import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../interfaces/identifier-escaper.interface';
import { escapeSnowflakeIdentifier } from '../utils/snowflake-identifier.utils';

@Injectable()
export class SnowflakeIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.SNOWFLAKE;

  escapeIdentifier(identifier: string): string {
    return escapeSnowflakeIdentifier(identifier);
  }
}
