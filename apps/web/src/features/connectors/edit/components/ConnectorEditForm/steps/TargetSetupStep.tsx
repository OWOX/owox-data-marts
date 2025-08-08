import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';
import { useEffect, useState } from 'react';

interface TargetSetupStepProps {
  dataStorageType: DataStorageType;
  target: { fullyQualifiedName: string; isValid: boolean } | null;
  destinationName: string;
  onTargetChange: (target: { fullyQualifiedName: string; isValid: boolean } | null) => void;
}

export function TargetSetupStep({
  dataStorageType,
  target,
  destinationName,
  onTargetChange,
}: TargetSetupStepProps) {
  const sanitizedDestinationName = destinationName.replace(/[^a-zA-Z0-9_]/g, '_');

  const [targetName, setTargetName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTargetName(target?.fullyQualifiedName.split('.')[0] ?? '');
  }, [target]);

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'This field is required';
    const allowed = /^[A-Za-z][A-Za-z0-9_]*$/;
    if (!allowed.test(name)) {
      return 'Use letters, numbers, and underscores; start with a letter';
    }
    return null;
  };

  const handleTargetNameChange = (name: string) => {
    setTargetName(name);
    const validationError = validate(name);
    setError(validationError);
    onTargetChange({
      fullyQualifiedName: `${name}.${sanitizedDestinationName}`.trim(),
      isValid: validationError === null,
    });
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
              value={targetName}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'dataset-name-error' : undefined}
              onChange={e => {
                handleTargetNameChange(e.target.value);
              }}
              required
            />
            {error && <p className='text-destructive text-sm'>{error}</p>}
            <div className='text-muted-foreground mt-2 text-sm'>
              Table will be created automatically: "{sanitizedDestinationName}"
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {targetName || '[dataset]'}.{sanitizedDestinationName}
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
              value={targetName}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'database-name-error' : undefined}
              onChange={e => {
                handleTargetNameChange(e.target.value);
              }}
              required
            />
            {error && <p className='text-destructive text-sm'>{error}</p>}
            <div className='text-muted-foreground mt-2 text-sm'>
              Table will be created automatically: "{sanitizedDestinationName}"
              <br />
              Full path:{' '}
              <span className='text-foreground/90'>
                {targetName || '[database]'}.{sanitizedDestinationName}
              </span>
            </div>
          </div>
        )}

        <TimeTriggerAnnouncement />
      </div>
    </div>
  );
}
