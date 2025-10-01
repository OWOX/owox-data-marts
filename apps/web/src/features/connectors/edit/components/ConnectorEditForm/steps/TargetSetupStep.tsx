import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';
import { useCallback, useEffect, useState } from 'react';
import {
  AppWizardStepItem,
  AppWizardStepLabel,
  AppWizardStepSection,
  AppWizardStep,
} from '@owox/ui/components/common/wizard';

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
    <AppWizardStep>
      <AppWizardStepSection title='Set target'>
        {dataStorageType === DataStorageType.GOOGLE_BIGQUERY && (
          <>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='dataset-name'
                tooltip='Enter dataset name for Google BigQuery where the connector data will be stored. The
                    dataset will be created automatically if it doesn`t exist'
              >
                Dataset name
              </AppWizardStepLabel>
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
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='table-name'
                tooltip='Enter table name where the connector data will be stored. The table will be created
                automatically if it doesn`t exist'
              >
                Table name
              </AppWizardStepLabel>
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
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                htmlFor='gbq-full-path'
                tooltip='Check your full path to target: dataset.table'
              >
                Auto-generated full path
              </AppWizardStepLabel>
              <Input
                id='gbq-full-path'
                disabled
                value={`${datasetName || '[dataset]'}.${tableName || '[table]'}`}
              />
            </AppWizardStepItem>
          </>
        )}
        {dataStorageType === DataStorageType.AWS_ATHENA && (
          <>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='database-name'
                tooltip='Enter database name for Amazon Athena where the connector data will be stored. The
                database will be created automatically if it doesn`t exist'
              >
                Database name
              </AppWizardStepLabel>
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
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='athena-table-name'
                tooltip='Enter table name where the connector data will be stored. The table will be created
                automatically if it doesn`t exist'
              >
                Table name
              </AppWizardStepLabel>
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
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                htmlFor='athena-full-path'
                tooltip='Check your full path to target: database.table'
              >
                Auto-generated full path
              </AppWizardStepLabel>
              <Input
                id='athena-full-path'
                disabled
                value={`${datasetName || '[database]'}.${tableName || '[table]'}`}
              />
            </AppWizardStepItem>
          </>
        )}
      </AppWizardStepSection>

      <AppWizardStepSection title='Schedule updates'>
        <TimeTriggerAnnouncement />
      </AppWizardStepSection>
    </AppWizardStep>
  );
}
