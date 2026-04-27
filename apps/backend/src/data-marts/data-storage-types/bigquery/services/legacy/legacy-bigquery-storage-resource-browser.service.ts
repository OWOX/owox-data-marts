import { Injectable, Logger } from '@nestjs/common';
import { DataStorageCredentialsResolver } from '../../../data-storage-credentials-resolver.service';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryStorageResourceBrowser } from '../bigquery-storage-resource-browser.service';

/**
 * Resource-browser for Legacy BigQuery storages.
 * The browsing logic is identical to standard BigQuery — only the registered
 * {@link DataStorageType} differs so that {@link TypeResolver} can dispatch to it.
 */
@Injectable()
export class LegacyBigQueryStorageResourceBrowser extends BigQueryStorageResourceBrowser {
  protected readonly logger = new Logger(LegacyBigQueryStorageResourceBrowser.name);
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(credentialsResolver: DataStorageCredentialsResolver) {
    super(credentialsResolver);
  }
}
