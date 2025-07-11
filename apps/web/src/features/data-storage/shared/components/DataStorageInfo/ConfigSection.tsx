import {
  type AwsAthenaDataStorageConfig,
  type DataStorageConfig,
  DataStorageType,
  type GoogleBigQueryDataStorageConfig,
  isAwsAthenaDataStorageConfig,
  isGoogleBigQueryDataStorageConfig,
} from '../../model/types';
import { InfoRow } from './InfoRow';

interface ConfigSectionProps {
  type: DataStorageType;
  config?: DataStorageConfig;
}

export const ConfigSection = ({ type, config }: ConfigSectionProps) => {
  const configFields = {
    [DataStorageType.GOOGLE_BIGQUERY]: [
      { label: 'Project ID', key: 'projectId' },
      { label: 'Location', key: 'location' },
    ],
    [DataStorageType.AWS_ATHENA]: [
      { label: 'Region', key: 'region' },
      { label: 'Database Name', key: 'databaseName' },
      { label: 'Output Bucket', key: 'outputBucket' },
    ],
    [DataStorageType.SNOWFLAKE]: [],
    [DataStorageType.DATABRICKS]: [],
    [DataStorageType.AWS_REDSHIFT]: [],
    [DataStorageType.AZURE_SYNAPSE]: [],
  };

  const isValidConfig =
    config &&
    ((type === DataStorageType.GOOGLE_BIGQUERY && isGoogleBigQueryDataStorageConfig(config)) ||
      (type === DataStorageType.AWS_ATHENA && isAwsAthenaDataStorageConfig(config)));

  return (
    <div className='grid gap-2'>
      {configFields[type].map(({ label, key }) => {
        let stringValue: string | undefined = undefined;

        if (isValidConfig) {
          stringValue =
            type === DataStorageType.GOOGLE_BIGQUERY
              ? (config as GoogleBigQueryDataStorageConfig)[
                  key as keyof GoogleBigQueryDataStorageConfig
                ]
              : (config as AwsAthenaDataStorageConfig)[key as keyof AwsAthenaDataStorageConfig];
        }

        return <InfoRow key={key} label={label} value={stringValue} />;
      })}
    </div>
  );
};
