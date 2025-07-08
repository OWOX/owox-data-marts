import { DataDestinationType } from '../../enums';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { SecureJsonInput } from '../../../../../shared';
import { SENSITIVE_KEYS } from '../../constants';
import {
  type GoogleServiceAccountCredentials,
  isGoogleServiceAccountCredentials,
} from '../../../../../shared/types';

interface CredentialsSectionProps {
  type: DataDestinationType;
  credentials?: GoogleServiceAccountCredentials;
}

export const CredentialsSection = ({ type, credentials }: CredentialsSectionProps) => {
  if (!credentials) {
    return <div className='text-muted-foreground text-sm'>No credentials provided.</div>;
  }

  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS: {
      const isValid = isGoogleServiceAccountCredentials(credentials);
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
    default:
      return <div className='text-muted-foreground text-sm'>Unknown destination type.</div>;
  }
};
