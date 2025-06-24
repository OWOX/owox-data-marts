import { DataStorageType } from '../../../../../data-storage/shared/model/types';

interface TargetSetupStepProps {
  dataStorageType: DataStorageType;
  target: { fullyQualifiedName: string } | null;
  selectedNode: string;
  onTargetChange: (target: { fullyQualifiedName: string }) => void;
}

export function TargetSetupStep({
  dataStorageType,
  target,
  selectedNode,
  onTargetChange,
}: TargetSetupStepProps) {
  const getTargetName = () => {
    return target?.fullyQualifiedName.split('.')[0] ?? '';
  };
  return (
    <div className='space-y-4'>
      <h4 className='text-lg font-medium'>Setup target</h4>
      <div className='flex flex-col gap-4'>
        {dataStorageType === DataStorageType.GOOGLE_BIGQUERY && (
          <div className='flex flex-col gap-2'>
            <label htmlFor='dataset-name' className='text-muted-foreground text-sm'>
              Enter dataset name for Google BigQuery where the connector data will be stored. The
              dataset will be created automatically if it doesn't exist.
            </label>
            <input
              type='text'
              id='dataset-name'
              placeholder='Enter dataset name'
              className='focus:ring-primary flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:outline-none'
              value={getTargetName()}
              onChange={e => {
                onTargetChange({
                  fullyQualifiedName: `${e.target.value}.${selectedNode}`,
                });
              }}
            />
          </div>
        )}
        {dataStorageType === DataStorageType.AWS_ATHENA && (
          <div className='flex flex-col gap-4'>
            <label htmlFor='dataset-name' className='text-muted-foreground text-sm'>
              Enter database name for Amazon Athena where the connector data will be stored. The
              database must exist before running the connector.
            </label>
            <input
              type='text'
              id='database-name'
              placeholder='Enter database name'
              className='focus:ring-primary flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-1 focus:outline-none'
              value={getTargetName()}
              onChange={e => {
                onTargetChange({
                  fullyQualifiedName: `${e.target.value}.${selectedNode}`,
                });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
