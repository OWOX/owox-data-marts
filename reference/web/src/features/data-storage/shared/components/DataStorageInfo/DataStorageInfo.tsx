import { DataStorageType } from '../../model/types';
import { type DataStorageConfig } from '../../model/types';
import { ConfigSection } from './ConfigSection';

interface DataStorageInfoProps {
  type: DataStorageType;
  config?: DataStorageConfig;
}

export const DataStorageInfo = ({ type, config }: DataStorageInfoProps) => {
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <h4 className='text-sm font-medium'>Configuration</h4>
        <ConfigSection type={type} config={config} />
      </div>
    </div>
  );
};
