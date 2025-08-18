import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';
import { useCallback, useEffect, useState } from 'react';

interface TargetSetupStepProps {
  dataStorageType: DataStorageType;
  target: { fullyQualifiedName: string; isValid: boolean } | null;
  destinationName: string;
  connectorName: string;
  onTargetChange: (target: { fullyQualifiedName: string; isValid: boolean } | null) => void;
}

export function TargetSetupStep({
  dataStorageType,
  target,
  destinationName,
  connectorName,
  onTargetChange,
}: TargetSetupStepProps) {
  const sanitizedDestinationName = destinationName.replace(/[^a-zA-Z0-9_]/g, '_');
  const sanitizedConnectorName = connectorName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

  const [datasetName, setDatasetName] = useState<string>('');
  const [tableName, setTableName] = useState<string>('');
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'This field is required';
    const allowed = /^[A-Za-z][A-Za-z0-9_]*$/;
    if (!allowed.test(name)) {
      return 'Use letters, numbers, and underscores; start with a letter';
    }
    return null;
  };

  const updateTarget = useCallback(
    (
      newDatasetName: string,
      newTableName: string,
      newDatasetError: string | null,
      newTableError: string | null
    ) => {
      onTargetChange({
        fullyQualifiedName: `${newDatasetName}.${newTableName}`,
        isValid: !!(
          newDatasetName &&
          newTableName &&
          newDatasetError === null &&
          newTableError === null
        ),
      });
    },
    [onTargetChange]
  );

  useEffect(() => {
    let newDatasetName = '';
    let newTableName = '';

    if (target?.fullyQualifiedName) {
      const parts = target.fullyQualifiedName.split('.');
      newDatasetName = parts[0] ?? '';
      newTableName = parts[1] ?? '';
    } else {
      newDatasetName = `${sanitizedConnectorName}_owox`;
      newTableName = sanitizedDestinationName;
    }

    const newDatasetError = validate(newDatasetName);
    const newTableError = validate(newTableName);

    setDatasetName(newDatasetName);
    setTableName(newTableName);
    setDatasetError(newDatasetError);
    setTableError(newTableError);

    const newFullyQualifiedName = `${newDatasetName}.${newTableName}`;
    const newIsValid = !!(
      newDatasetName &&
      newTableName &&
      newDatasetError === null &&
      newTableError === null
    );

    if (
      !target ||
      target.fullyQualifiedName !== newFullyQualifiedName ||
      target.isValid !== newIsValid
    ) {
      updateTarget(newDatasetName, newTableName, newDatasetError, newTableError);
    }
  }, [target, sanitizedDestinationName, sanitizedConnectorName, updateTarget]);

  const handleDatasetNameChange = (name: string) => {
    setDatasetName(name);
    const validationError = validate(name);
    setDatasetError(validationError);
    updateTarget(name, tableName, validationError, tableError);
  };

  const handleTableNameChange = (name: string) => {
    setTableName(name);
    const validationError = validate(name);
    setTableError(validationError);
    updateTarget(datasetName, name, datasetError, validationError);
  };

  return (
    <div className='space-y-4'>
      <h4 className='text-lg font-medium'>Setup target</h4>
      <div className='flex flex-col gap-4'>
        {dataStorageType === DataStorageType.GOOGLE_BIGQUERY && (
          <div className='flex flex-col gap-4'>
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
                value={datasetName}
                aria-invalid={Boolean(datasetError)}
                aria-describedby={datasetError ? 'dataset-name-error' : undefined}
                onChange={e => {
                  handleDatasetNameChange(e.target.value);
                }}
                required
              />
              {datasetError && (
                <p id='dataset-name-error' className='text-destructive text-sm'>
                  {datasetError}
                </p>
              )}
            </div>

            <div className='flex flex-col gap-2'>
              <label htmlFor='table-name' className='text-muted-foreground text-sm'>
                Enter table name where the connector data will be stored. The table will be created
                automatically if it doesn't exist.
              </label>
              <Input
                type='text'
                id='table-name'
                placeholder='Enter table name'
                autoComplete='off'
                className='box-border w-full'
                value={tableName}
                aria-invalid={Boolean(tableError)}
                aria-describedby={tableError ? 'table-name-error' : undefined}
                onChange={e => {
                  handleTableNameChange(e.target.value);
                }}
                required
              />
              {tableError && (
                <p id='table-name-error' className='text-destructive text-sm'>
                  {tableError}
                </p>
              )}
            </div>

            <div className='text-muted-foreground mt-2 text-sm'>
              Full path:{' '}
              <span className='text-foreground/90'>
                {datasetName || '[dataset]'}.{tableName || '[table]'}
              </span>
            </div>
          </div>
        )}
        {dataStorageType === DataStorageType.AWS_ATHENA && (
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <label htmlFor='database-name' className='text-muted-foreground text-sm'>
                Enter database name for Amazon Athena where the connector data will be stored. The
                database will be created automatically if it doesn't exist.
              </label>
              <Input
                type='text'
                id='database-name'
                placeholder='Enter database name'
                autoComplete='off'
                className='box-border w-full'
                value={datasetName}
                aria-invalid={Boolean(datasetError)}
                aria-describedby={datasetError ? 'database-name-error' : undefined}
                onChange={e => {
                  handleDatasetNameChange(e.target.value);
                }}
                required
              />
              {datasetError && (
                <p id='database-name-error' className='text-destructive text-sm'>
                  {datasetError}
                </p>
              )}
            </div>

            <div className='flex flex-col gap-2'>
              <label htmlFor='athena-table-name' className='text-muted-foreground text-sm'>
                Enter table name where the connector data will be stored. The table will be created
                automatically if it doesn't exist.
              </label>
              <Input
                type='text'
                id='athena-table-name'
                placeholder='Enter table name'
                autoComplete='off'
                className='box-border w-full'
                value={tableName}
                aria-invalid={Boolean(tableError)}
                aria-describedby={tableError ? 'athena-table-name-error' : undefined}
                onChange={e => {
                  handleTableNameChange(e.target.value);
                }}
                required
              />
              {tableError && (
                <p id='athena-table-name-error' className='text-destructive text-sm'>
                  {tableError}
                </p>
              )}
            </div>

            <div className='text-muted-foreground mt-2 text-sm'>
              Full path:{' '}
              <span className='text-foreground/90'>
                {datasetName || '[database]'}.{tableName || '[table]'}
              </span>
            </div>
          </div>
        )}

        <TimeTriggerAnnouncement />
      </div>
    </div>
  );
}
