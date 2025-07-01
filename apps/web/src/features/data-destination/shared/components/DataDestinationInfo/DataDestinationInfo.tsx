import { DataDestinationType } from '../../enums';
import { CredentialsSection } from './CredentialsSection';
import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';

interface DataDestinationInfoProps {
  type: DataDestinationType;
  credentials?: GoogleServiceAccountCredentials;
}

export const DataDestinationInfo = ({ type, credentials }: DataDestinationInfoProps) => {
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <h4 className='text-sm font-medium'>Credentials</h4>
        <CredentialsSection type={type} credentials={credentials} />
      </div>
    </div>
  );
};
