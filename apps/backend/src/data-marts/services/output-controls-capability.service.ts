import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

@Injectable()
export class OutputControlsCapabilityService {
  // Source of truth — keep frontend mirrors (web + extension output-controls-support.ts) in sync.
  private readonly supported: ReadonlySet<DataStorageType> = new Set([
    DataStorageType.GOOGLE_BIGQUERY,
    DataStorageType.AWS_ATHENA,
    DataStorageType.AWS_REDSHIFT,
  ]);

  isSupported(type: DataStorageType): boolean {
    return this.supported.has(type);
  }
}
