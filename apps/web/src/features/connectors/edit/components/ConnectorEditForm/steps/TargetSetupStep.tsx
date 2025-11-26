import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';
import { useCallback, useEffect, useState } from 'react';
import {
  AppWizardStepItem,
  AppWizardStepLabel,
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepHero,
} from '@owox/ui/components/common/wizard';
import { GoogleBigQueryIcon, AwsAthenaIcon, SnowflakeIcon } from '../../../../../../shared';

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
  const [schemaName, setSchemaName] = useState<string>('');
  const [tableName, setTableName] = useState<string>('');
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
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
      newTableError: string | null,
      newSchemaName?: string,
      newSchemaError?: string | null
    ) => {
      const fullyQualifiedName =
        dataStorageType === DataStorageType.SNOWFLAKE && newSchemaName
          ? `${newDatasetName}.${newSchemaName}.${newTableName}`
          : `${newDatasetName}.${newTableName}`;

      const isValid =
        dataStorageType === DataStorageType.SNOWFLAKE
          ? !!(
              newDatasetName &&
              newSchemaName &&
              newTableName &&
              newDatasetError === null &&
              newSchemaError === null &&
              newTableError === null
            )
          : !!(
              newDatasetName &&
              newTableName &&
              newDatasetError === null &&
              newTableError === null
            );

      onTargetChange({
        fullyQualifiedName,
        isValid,
      });
    },
    [onTargetChange, dataStorageType]
  );

  useEffect(() => {
    let newDatasetName = '';
    let newSchemaName = '';
    let newTableName = '';

    if (target?.fullyQualifiedName) {
      const parts = target.fullyQualifiedName.split('.');
      if (dataStorageType === DataStorageType.SNOWFLAKE && parts.length === 3) {
        newDatasetName = parts[0] ?? '';
        newSchemaName = parts[1] ?? '';
        newTableName = parts[2] ?? '';
      } else {
        newDatasetName = parts[0] ?? '';
        newTableName = parts[1] ?? '';
      }
    } else {
      newDatasetName = `${sanitizedConnectorName}_owox`;
      if (dataStorageType === DataStorageType.SNOWFLAKE) {
        newSchemaName = 'PUBLIC';
      }
      newTableName = sanitizedDestinationName;
    }

    const newDatasetError = validate(newDatasetName);
    const newSchemaError =
      dataStorageType === DataStorageType.SNOWFLAKE ? validate(newSchemaName) : null;
    const newTableError = validate(newTableName);

    setDatasetName(newDatasetName);
    setSchemaName(newSchemaName);
    setTableName(newTableName);
    setDatasetError(newDatasetError);
    setSchemaError(newSchemaError);
    setTableError(newTableError);

    const newFullyQualifiedName =
      dataStorageType === DataStorageType.SNOWFLAKE && newSchemaName
        ? `${newDatasetName}.${newSchemaName}.${newTableName}`
        : `${newDatasetName}.${newTableName}`;

    const newIsValid =
      dataStorageType === DataStorageType.SNOWFLAKE
        ? !!(
            newDatasetName &&
            newSchemaName &&
            newTableName &&
            newDatasetError === null &&
            newSchemaError === null &&
            newTableError === null
          )
        : !!(newDatasetName && newTableName && newDatasetError === null && newTableError === null);

    if (target?.fullyQualifiedName !== newFullyQualifiedName || target.isValid !== newIsValid) {
      updateTarget(
        newDatasetName,
        newTableName,
        newDatasetError,
        newTableError,
        newSchemaName,
        newSchemaError
      );
    }
  }, [target, sanitizedDestinationName, sanitizedConnectorName, dataStorageType, updateTarget]);

  const handleDatasetNameChange = (name: string) => {
    setDatasetName(name);
    const validationError = validate(name);
    setDatasetError(validationError);
    updateTarget(name, tableName, validationError, tableError, schemaName, schemaError);
  };

  const handleSchemaNameChange = (name: string) => {
    setSchemaName(name);
    const validationError = validate(name);
    setSchemaError(validationError);
    updateTarget(datasetName, tableName, datasetError, tableError, name, validationError);
  };

  const handleTableNameChange = (name: string) => {
    setTableName(name);
    const validationError = validate(name);
    setTableError(validationError);
    updateTarget(datasetName, name, datasetError, validationError, schemaName, schemaError);
  };

  return (
    <AppWizardStep>
      {dataStorageType === DataStorageType.GOOGLE_BIGQUERY && (
        <>
          <AppWizardStepHero
            icon={<GoogleBigQueryIcon />}
            title='Google BigQuery'
            docUrl='https://docs.owox.com/docs/storages/supported-storages/google-bigquery/'
            variant='compact'
          />
          <AppWizardStepSection title='Choose where to store your data'>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='dataset-name'
                tooltip='Enter dataset name for Google BigQuery where the connector data will be stored.'
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
              <p className='text-muted-foreground text-sm'>
                Dataset is auto-created on first run if it doesn’t exist
              </p>
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
                tooltip='Enter table name where the connector data will be stored.'
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
              <p className='text-muted-foreground text-sm'>
                Table is auto-created on first run if it doesn’t exist
              </p>
              {tableError && (
                <p id='table-name-error' className='text-destructive text-sm'>
                  {tableError}
                </p>
              )}
            </AppWizardStepItem>
          </AppWizardStepSection>
        </>
      )}
      {dataStorageType === DataStorageType.AWS_ATHENA && (
        <>
          <AppWizardStepHero
            icon={<AwsAthenaIcon />}
            title='AWS Athena'
            docUrl='https://docs.owox.com/docs/storages/supported-storages/aws-athena/'
            variant='compact'
          />
          <AppWizardStepSection title='Choose where to store your data'>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='database-name'
                tooltip='Enter database name for Amazon Athena where the connector data will be stored.'
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
              <p className='text-muted-foreground text-sm'>
                Database is auto-created on first run if it doesn’t exist
              </p>
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
                tooltip='Enter table name where the connector data will be stored.'
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
              <p className='text-muted-foreground text-sm'>
                Table is auto-created on first run if it doesn’t exist
              </p>
              {tableError && (
                <p id='athena-table-name-error' className='text-destructive text-sm'>
                  {tableError}
                </p>
              )}
            </AppWizardStepItem>
          </AppWizardStepSection>
        </>
      )}
      {dataStorageType === DataStorageType.SNOWFLAKE && (
        <>
          <AppWizardStepHero
            icon={<SnowflakeIcon />}
            title='Snowflake'
            docUrl='https://docs.owox.com/docs/storages/supported-storages/snowflake/'
            variant='compact'
          />
          <AppWizardStepSection title='Choose where to store your data'>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='snowflake-database-name'
                tooltip='Enter database name for Snowflake where the connector data will be stored.'
              >
                Database name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='snowflake-database-name'
                placeholder='Enter database name'
                autoComplete='off'
                className='box-border w-full'
                value={datasetName}
                aria-invalid={Boolean(datasetError)}
                aria-describedby={datasetError ? 'snowflake-database-name-error' : undefined}
                onChange={e => {
                  handleDatasetNameChange(e.target.value);
                }}
                required
              />
              <p className='text-muted-foreground text-sm'>
                Database is auto-created on first run if it doesn't exist
              </p>
              {datasetError && (
                <p id='snowflake-database-name-error' className='text-destructive text-sm'>
                  {datasetError}
                </p>
              )}
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='snowflake-schema-name'
                tooltip='Enter schema name for Snowflake where the connector data will be stored.'
              >
                Schema name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='snowflake-schema-name'
                placeholder='Enter schema name'
                autoComplete='off'
                className='box-border w-full'
                value={schemaName}
                aria-invalid={Boolean(schemaError)}
                aria-describedby={schemaError ? 'snowflake-schema-name-error' : undefined}
                onChange={e => {
                  handleSchemaNameChange(e.target.value);
                }}
                required
              />
              <p className='text-muted-foreground text-sm'>
                Schema is auto-created on first run if it doesn't exist
              </p>
              {schemaError && (
                <p id='snowflake-schema-name-error' className='text-destructive text-sm'>
                  {schemaError}
                </p>
              )}
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='snowflake-table-name'
                tooltip='Enter table name where the connector data will be stored.'
              >
                Table name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='snowflake-table-name'
                placeholder='Enter table name'
                autoComplete='off'
                className='box-border w-full'
                value={tableName}
                aria-invalid={Boolean(tableError)}
                aria-describedby={tableError ? 'snowflake-table-name-error' : undefined}
                onChange={e => {
                  handleTableNameChange(e.target.value);
                }}
                required
              />
              <p className='text-muted-foreground text-sm'>
                Table is auto-created on first run if it doesn't exist
              </p>
              {tableError && (
                <p id='snowflake-table-name-error' className='text-destructive text-sm'>
                  {tableError}
                </p>
              )}
            </AppWizardStepItem>
          </AppWizardStepSection>
        </>
      )}
      <AppWizardStepSection title='Schedule updates'>
        <TimeTriggerAnnouncement />
      </AppWizardStepSection>
    </AppWizardStep>
  );
}
