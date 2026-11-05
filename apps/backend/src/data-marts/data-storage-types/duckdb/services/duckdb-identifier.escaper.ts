import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../interfaces/identifier-escaper.interface';
import { escapeDuckDbIdentifier } from '../utils/duckdb-identifier.utils';

@Injectable()
export class DuckDbIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.DUCKDB;

  escapeIdentifier(identifier: string): string {
    return escapeDuckDbIdentifier(identifier);
  }
}
