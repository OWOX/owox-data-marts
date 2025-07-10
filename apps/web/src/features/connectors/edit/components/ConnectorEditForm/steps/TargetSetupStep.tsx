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
                  fullyQualifiedName: `${e.target.value}.${selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}`,
                });
              }}
            />
            <div className='text-muted-foreground mt-2 text-sm'>
              Table name will be created automatically based on the selected node name: "
              {selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}"
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {getTargetName() || '[dataset]'}.{selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}
              </span>
            </div>
          </div>
        )}
        {dataStorageType === DataStorageType.AWS_ATHENA && (
          <div className='flex flex-col gap-4'>
            <label htmlFor='dataset-name' className='text-muted-foreground text-sm'>
              Enter database name for Amazon Athena where the connector data will be stored. The
              database must exist before running the connector.
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
                  fullyQualifiedName: `${e.target.value}.${selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}`,
                });
              }}
            />
            <div className='text-muted-foreground mt-2 text-sm'>
              Table name will be created automatically based on the selected node name: "
              {selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}"
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {getTargetName() || '[database]'}.{selectedNode.replace(/[^a-zA-Z0-9_]/g, '_')}
              </span>
            </div>
          </div>
        )}

        <TimeTriggerAnnouncement />
      </div>
    </div>
  );
}
