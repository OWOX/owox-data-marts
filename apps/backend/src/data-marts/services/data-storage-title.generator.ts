import { TypedComponent } from '../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { BigQueryConfigDto, BigQueryConfigSchema } from '../dto/schemas/big-query-config.schema';
import { AthenaConfigDto, AthenaConfigSchema } from '../dto/schemas/athena-config.schema';
import { Injectable } from '@nestjs/common';

export interface DataStorageTitleGenerator extends TypedComponent<DataStorageType> {
  generateTitle(config: Record<string, unknown>): string;
}

@Injectable()
export class BigQueryTitleGenerator implements DataStorageTitleGenerator {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  generateTitle(config: Record<string, unknown>): string {
    const parsed: BigQueryConfigDto = BigQueryConfigSchema.parse(config);
    return `${parsed.projectId} / ${parsed.datasetId} / ${parsed.location}`;
  }
}

@Injectable()
export class AthenaTitleGenerator implements DataStorageTitleGenerator {
  readonly type = DataStorageType.AWS_ATHENA;

  generateTitle(config: Record<string, unknown>): string {
    const parsed: AthenaConfigDto = AthenaConfigSchema.parse(config);
    return `${parsed.region} / ${parsed.databaseName} / ${parsed.outputBucket}`;
  }
}
