import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../interfaces/identifier-escaper.interface';
import { escapeDatabricksIdentifier } from '../utils/databricks-identifier.utils';

@Injectable()
export class DatabricksIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.DATABRICKS;

  escapeIdentifier(identifier: string): string {
    return escapeDatabricksIdentifier(identifier);
  }
}
