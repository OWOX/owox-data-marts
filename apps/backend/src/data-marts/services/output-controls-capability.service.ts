import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

@Injectable()
export class OutputControlsCapabilityService {
  private readonly supported: ReadonlySet<DataStorageType> = new Set([
    DataStorageType.GOOGLE_BIGQUERY,
  ]);

  isSupported(type: DataStorageType): boolean {
    return this.supported.has(type);
  }
}
