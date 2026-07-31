import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerBigQueryDataQualityIntegrationSuite } from './data-quality-bigquery-test-support';

registerBigQueryDataQualityIntegrationSuite(DataStorageType.GOOGLE_BIGQUERY, 'BigQuery');
