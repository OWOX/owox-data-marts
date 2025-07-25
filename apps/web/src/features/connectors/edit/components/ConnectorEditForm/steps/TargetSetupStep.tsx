import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';

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
  const tableName = selectedNode.replace(/[^a-zA-Z0-9_]/g, '_');

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
            <Input
              type='text'
              id='dataset-name'
              placeholder='Enter dataset name'
              autoComplete='off'
              className='box-border w-full'
              value={getTargetName()}
              onChange={e => {
                onTargetChange({
                  fullyQualifiedName: `${e.target.value}.${tableName}`,
                });
              }}
            />
            <div className='text-muted-foreground mt-2 text-sm'>
              Table name will be created automatically based on the selected node name: "{tableName}
              "
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {getTargetName() || '[dataset]'}.{tableName}
              </span>
            </div>
          </div>
        )}
        {dataStorageType === DataStorageType.AWS_ATHENA && (
          <div className='flex flex-col gap-4'>
            <label htmlFor='dataset-name' className='text-muted-foreground text-sm'>
              The entered Amazon Athena database will be used or created automatically if it doesn’t
              exist
            </label>
            <Input
              type='text'
              id='database-name'
              placeholder='Enter database name'
              autoComplete='off'
              className='box-border w-full'
              value={getTargetName()}
              onChange={e => {
                onTargetChange({
                  fullyQualifiedName: `${e.target.value}.${tableName}`,
                });
              }}
            />
            <div className='text-muted-foreground mt-2 text-sm'>
              The table "{tableName}" will be created automatically in the selected database
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {getTargetName() || '[database]'}.{tableName}
              </span>
            </div>
          </div>
        )}

        <TimeTriggerAnnouncement />
      </div>
    </div>
  );
}
