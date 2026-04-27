import { BadRequestException, Injectable } from '@nestjs/common';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import type { IStorageResourceBrowser } from '../interfaces/storage-resource-browser.interface';
import { BigQueryApiAdapterFactory } from '../bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryConfigSchema } from '../bigquery/schemas/bigquery-config.schema';

/**
 * Resolves the correct {@link IStorageResourceBrowser} implementation for a given
 * {@link DataStorage}.  Follows the facade pattern used by other storage facades in
 * this directory (e.g. `DataStorageAccessValidatorFacade`).
 *
 * Add a new `case` here when another storage type gains resource-browsing support.
 */
@Injectable()
export class StorageResourceBrowserFacade {
  constructor(private readonly bigQueryFactory: BigQueryApiAdapterFactory) {}

  async create(storage: DataStorage): Promise<IStorageResourceBrowser> {
    switch (storage.type) {
      case DataStorageType.GOOGLE_BIGQUERY:
      case DataStorageType.LEGACY_GOOGLE_BIGQUERY: {
        const config = BigQueryConfigSchema.parse(storage.config ?? {});
        return this.bigQueryFactory.createFromStorage(storage, config);
      }
      default:
        throw new BadRequestException(
          `Resource browsing is not supported for storage type: ${storage.type}`
        );
    }
  }
}
