import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../../interfaces/identifier-escaper.interface';
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';

@Injectable()
export class AthenaIdentifierEscaper implements IdentifierEscaper {
  readonly type = DataStorageType.AWS_ATHENA;

  escapeIdentifier(identifier: string): string {
    return escapeAthenaIdentifier(identifier);
  }
}
