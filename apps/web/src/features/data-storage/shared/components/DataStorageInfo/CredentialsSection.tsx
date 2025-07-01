import { DataStorageType } from '../../model/types';
import {
  type DataStorageCredentials,
  isGoogleBigQueryCredentials,
  isAwsAthenaCredentials,
} from '../../model/types';
import { SENSITIVE_KEYS } from '../../constants';
import { InfoRow } from './InfoRow';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { SecureJsonInput } from '../../../../../shared';

interface CredentialsSectionProps {
  type: DataStorageType;
  credentials?: DataStorageCredentials;
}

export const CredentialsSection = ({ type, credentials }: CredentialsSectionProps) => {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY: {
      const isValid = credentials && isGoogleBigQueryCredentials(credentials);
      const serviceAccountValue = isValid ? String(credentials.serviceAccount) : undefined;
      return (
        <div className='grid gap-2'>
          <div className='grid grid-cols-2 gap-1'>
            <span className='text-muted-foreground text-sm'>Service Account:</span>
            {serviceAccountValue ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='cursor-help truncate text-sm'>
                    {serviceAccountValue.length > 30
                      ? serviceAccountValue.substring(0, 30) + '...'
                      : serviceAccountValue}
                  </span>
                </TooltipTrigger>
                <TooltipContent className='max-w-md'>
                  <SecureJsonInput
                    displayOnly={true}
                    value={serviceAccountValue}
                    keysToMask={SENSITIVE_KEYS}
                  ></SecureJsonInput>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className='text-sm'>
                <span className='text-muted-foreground'>—</span>
              </span>
            )}
          </div>
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
