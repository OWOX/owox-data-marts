import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryBlendedQueryBuilder } from '../bigquery-blended-query-builder';

/**
 * Legacy BigQuery uses the identical BigQuery SQL dialect, adapter and renderer as
 * {@link BigQueryBlendedQueryBuilder}; only the storage-type discriminator differs so
 * the blended TypeResolver can route LEGACY_GOOGLE_BIGQUERY marts to it.
 */
@Injectable()
export class LegacyBigQueryBlendedQueryBuilder extends BigQueryBlendedQueryBuilder {
  readonly type: DataStorageType = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}
