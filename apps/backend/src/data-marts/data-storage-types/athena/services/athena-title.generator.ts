import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AthenaConfig, AthenaConfigSchema } from '../schemas/athena-config.schema';
import { DataStorageTitleGenerator } from '../../interfaces/data-storage-title-generator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';

@Injectable()
export class AthenaTitleGenerator implements DataStorageTitleGenerator {
  readonly type = DataStorageType.AWS_ATHENA;

  generateTitle(config: DataStorageConfig): string {
    const parsed: AthenaConfig = AthenaConfigSchema.parse(config);
    return `${parsed.region} / ${parsed.databaseName} / ${parsed.outputBucket}`;
  }
}
