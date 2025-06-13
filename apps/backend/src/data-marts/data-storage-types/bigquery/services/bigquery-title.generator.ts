import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryConfig, BigQueryConfigSchema } from '../schemas/bigquery-config.schema';
import { DataStorageTitleGenerator } from '../../interfaces/data-storage-title-generator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';

@Injectable()
export class BigQueryTitleGenerator implements DataStorageTitleGenerator {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  generateTitle(config: DataStorageConfig): string {
    const parsed: BigQueryConfig = BigQueryConfigSchema.parse(config);
    return `${parsed.projectId} / ${parsed.location}`;
  }
}
