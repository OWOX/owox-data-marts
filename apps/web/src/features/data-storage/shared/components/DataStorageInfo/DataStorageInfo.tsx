import { DataStorageType } from '../../model/types';
import { type DataStorageConfig } from '../../model/types';
import { type DataStorageCredentials } from '../../model/types';
import { ConfigSection } from './ConfigSection';
import { CredentialsSection } from './CredentialsSection';

interface DataStorageInfoProps {
  type: DataStorageType;
  config?: DataStorageConfig;
  credentials?: DataStorageCredentials;
}

export const DataStorageInfo = ({ type, config, credentials }: DataStorageInfoProps) => {
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <h4 className='text-sm font-medium'>Configuration</h4>
        <ConfigSection type={type} config={config} />
      </div>

      <div className='space-y-1'>
        <h4 className='text-sm font-medium'>Credentials</h4>
        <CredentialsSection type={type} credentials={credentials} />
      </div>
    </div>
  );
};
