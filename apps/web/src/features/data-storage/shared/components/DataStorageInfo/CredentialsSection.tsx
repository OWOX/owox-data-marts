import { DataStorageType } from '../../model/types';
import {
  type DataStorageCredentials,
  isGoogleBigQueryCredentials,
  isAwsAthenaCredentials,
} from '../../model/types';
import { InfoRow } from './InfoRow';

interface CredentialsSectionProps {
  type: DataStorageType;
  credentials?: DataStorageCredentials;
}

export const CredentialsSection = ({ type, credentials }: CredentialsSectionProps) => {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY: {
      const isValid = credentials && isGoogleBigQueryCredentials(credentials);
      return (
        <div className='grid gap-2'>
          <InfoRow
            label='Service Account'
            value={isValid ? String(credentials.serviceAccount) : undefined}
            truncate
          />
        </div>
      );
    }

    case DataStorageType.AWS_ATHENA: {
      const isValid = credentials && isAwsAthenaCredentials(credentials);
      return (
        <div className='grid gap-2'>
          <InfoRow
            label='Access Key ID'
            value={isValid ? String(credentials.accessKeyId) : undefined}
          />
          <InfoRow
            label='Secret Access Key'
            value={isValid && credentials.secretAccessKey ? '••••••••••••••••' : undefined}
          />
        </div>
      );
    }

    default:
      return <p className='text-gray-500 italic'>Unknown credential type</p>;
  }
};
