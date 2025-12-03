import { DataStorageType } from '../../../../../data-storage';
import { Input } from '@owox/ui/components/input';
import { TimeTriggerAnnouncement } from '../../../../../data-marts/scheduled-triggers';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppWizardStepItem,
  AppWizardStepLabel,
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepHero,
} from '@owox/ui/components/common/wizard';
import {
  GoogleBigQueryIcon,
  AwsAthenaIcon,
  SnowflakeIcon,
  AwsRedshiftIcon,
} from '../../../../../../shared';
import { quoteIdentifier, unquoteIdentifier } from '../../../utils/snowflake-identifier.utils';

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

  // Track if user has manually edited the schema and table fields
  const schemaEditedByUser = useRef(false);
  const tableEditedByUser = useRef(false);

  const validate = (name: string, allowQuoted = false): string | null => {
    if (!name.trim()) return 'This field is required';

    // For Snowflake, allow quoted identifiers (e.g., "SCHEMA_NAME")
    // But also allow unquoted identifiers - quotes will be added automatically when saving
    if (allowQuoted && name.startsWith('"') && name.endsWith('"')) {
      const unquoted = name.slice(1, -1);
      if (!unquoted) return 'Quoted identifier cannot be empty';
      // Validate the content inside quotes - can be anything except empty
      return null;
    }

    // Validate unquoted identifiers
    const allowed = /^[A-Za-z][A-Za-z0-9_]*$/;
    if (!allowed.test(name)) {
      const message = allowQuoted
        ? 'Use letters, numbers, and underscores; start with a letter'
        : 'Use letters, numbers, and underscores; start with a letter';
      return message;
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
      let fullyQualifiedName: string;

      if (dataStorageType === DataStorageType.SNOWFLAKE && newSchemaName) {
        // For Snowflake: quote schema and table, but not database
        const quotedSchema = quoteIdentifier(newSchemaName);
        const quotedTable = quoteIdentifier(newTableName);
        fullyQualifiedName = `${newDatasetName}.${quotedSchema}.${quotedTable}`;
      } else if (dataStorageType === DataStorageType.AWS_REDSHIFT) {
        if (!newSchemaName || !newTableName) {
          fullyQualifiedName = '';
        } else {
          const quotedSchema = quoteIdentifier(newSchemaName);
          const quotedTable = quoteIdentifier(newTableName);
          fullyQualifiedName = `${quotedSchema}.${quotedTable}`;
        }
      } else {
        fullyQualifiedName = `${newDatasetName}.${newTableName}`;
      }

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
          : dataStorageType === DataStorageType.AWS_REDSHIFT
            ? !!(newSchemaName && newTableName && newSchemaError === null && newTableError === null)
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
      // Split by dots, but preserve quoted identifiers
      const parts = target.fullyQualifiedName.match(/(?:[^."]+|"[^"]*")+/g) ?? [];
      if (dataStorageType === DataStorageType.SNOWFLAKE && parts.length === 3) {
        const dataset = parts[0];
        const schema = parts[1];
        const table = parts[2];
        if (dataset && schema && table) {
          newDatasetName = dataset;
          newSchemaName = unquoteIdentifier(schema);
          newTableName = unquoteIdentifier(table);
        }
      } else if (dataStorageType === DataStorageType.AWS_REDSHIFT) {
        if (parts.length === 2) {
          const schema = parts[0];
          const table = parts[1];
          if (schema && table) {
            newSchemaName = unquoteIdentifier(schema);
            newTableName = unquoteIdentifier(table);
          }
        } else if (parts.length === 3) {
          const schema = parts[1];
          const table = parts[2];
          if (schema && table) {
            newSchemaName = unquoteIdentifier(schema);
            newTableName = unquoteIdentifier(table);
          }
        }
      } else if (parts.length >= 2) {
        const dataset = parts[0];
        const table = parts[1];
        if (dataset && table) {
          newDatasetName = dataset;
          newTableName = table;
        }
      }
    } else {
      newDatasetName = `${sanitizedConnectorName}_owox`;
      if (dataStorageType === DataStorageType.SNOWFLAKE) {
        newSchemaName = 'PUBLIC';
      } else if (dataStorageType === DataStorageType.AWS_REDSHIFT) {
        newSchemaName = `${sanitizedConnectorName}_owox`;
      }
      newTableName = sanitizedDestinationName;
    }

    const newDatasetError =
      dataStorageType === DataStorageType.AWS_REDSHIFT ? null : validate(newDatasetName);
    const newSchemaError =
      dataStorageType === DataStorageType.SNOWFLAKE
        ? validate(newSchemaName, true)
        : dataStorageType === DataStorageType.AWS_REDSHIFT
          ? newSchemaName
            ? validate(newSchemaName, true)
            : null
          : null;
    const newTableError = validate(
      newTableName,
      dataStorageType === DataStorageType.SNOWFLAKE ||
        dataStorageType === DataStorageType.AWS_REDSHIFT
    );

    setDatasetName(newDatasetName);
    // Only update schema if user hasn't manually edited it
    if (!schemaEditedByUser.current) {
      setSchemaName(newSchemaName);
      setSchemaError(newSchemaError);
    }
    // Only update table if user hasn't manually edited it
    if (!tableEditedByUser.current) {
      setTableName(newTableName);
      setTableError(newTableError);
    }
    setDatasetError(newDatasetError);

    const newFullyQualifiedName =
      dataStorageType === DataStorageType.SNOWFLAKE && newSchemaName
        ? `${newDatasetName}.${quoteIdentifier(newSchemaName)}.${quoteIdentifier(newTableName)}`
        : dataStorageType === DataStorageType.AWS_REDSHIFT
          ? newSchemaName && newTableName
            ? `${quoteIdentifier(newSchemaName)}.${quoteIdentifier(newTableName)}`
            : ''
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
        : dataStorageType === DataStorageType.AWS_REDSHIFT
          ? !!(newSchemaName && newTableName && newSchemaError === null && newTableError === null)
          : !!(
              newDatasetName &&
              newTableName &&
              newDatasetError === null &&
              newTableError === null
            );

    // Only update target from useEffect if user hasn't manually edited fields
    // When user edits, handleSchemaNameChange/handleTableNameChange will call updateTarget
    const shouldUpdate =
      !schemaEditedByUser.current &&
      !tableEditedByUser.current &&
      (target?.fullyQualifiedName !== newFullyQualifiedName || target.isValid !== newIsValid);

    if (shouldUpdate) {
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
    schemaEditedByUser.current = true;
    setSchemaName(name);
    // Schema is required for both Snowflake and Redshift
    const validationError = validate(name, true); // Allow quoted identifiers
    setSchemaError(validationError);
    updateTarget(datasetName, tableName, datasetError, tableError, name, validationError);
  };

  const handleTableNameChange = (name: string) => {
    tableEditedByUser.current = true;
    setTableName(name);
    const validationError = validate(
      name,
      dataStorageType === DataStorageType.SNOWFLAKE ||
        dataStorageType === DataStorageType.AWS_REDSHIFT
    );
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
                tooltip='Enter schema name for Snowflake where the connector data will be stored. Identifiers will be quoted automatically to preserve case sensitivity.'
              >
                Schema name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='snowflake-schema-name'
                placeholder='PUBLIC'
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
                tooltip='Enter table name where the connector data will be stored. Identifiers will be quoted automatically to preserve case sensitivity.'
              >
                Table name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='snowflake-table-name'
                placeholder='my_table'
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
      {dataStorageType === DataStorageType.AWS_REDSHIFT && (
        <>
          <AppWizardStepHero
            icon={<AwsRedshiftIcon />}
            title='AWS Redshift'
            docUrl='https://docs.owox.com/docs/storages/supported-storages/aws-redshift/'
            variant='compact'
          />
          <AppWizardStepSection title='Choose where to store your data'>
            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='redshift-schema-name'
                tooltip='Enter schema name for Redshift where the connector data will be stored. Identifiers will be quoted automatically to preserve case sensitivity.'
              >
                Schema name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='redshift-schema-name'
                placeholder='public'
                autoComplete='off'
                className='box-border w-full'
                value={schemaName}
                aria-invalid={Boolean(schemaError)}
                aria-describedby={schemaError ? 'redshift-schema-name-error' : undefined}
                onChange={e => {
                  handleSchemaNameChange(e.target.value);
                }}
                required
              />
              <p className='text-muted-foreground text-sm'>
                Schema is auto-created on first run if it doesn't exist. Identifiers will be quoted
                automatically to preserve case sensitivity.
              </p>
              {schemaError && (
                <p id='redshift-schema-name-error' className='text-destructive text-sm'>
                  {schemaError}
                </p>
              )}
            </AppWizardStepItem>

            <AppWizardStepItem>
              <AppWizardStepLabel
                required={true}
                htmlFor='redshift-table-name'
                tooltip='Enter table name where the connector data will be stored. Identifiers will be quoted automatically to preserve case sensitivity.'
              >
                Table name
              </AppWizardStepLabel>
              <Input
                type='text'
                id='redshift-table-name'
                placeholder='my_table'
                autoComplete='off'
                className='box-border w-full'
                value={tableName}
                aria-invalid={Boolean(tableError)}
                aria-describedby={tableError ? 'redshift-table-name-error' : undefined}
                onChange={e => {
                  handleTableNameChange(e.target.value);
                }}
                required
              />
              <p className='text-muted-foreground text-sm'>
                Table is auto-created on first run if it doesn't exist. Identifiers will be quoted
                automatically to preserve case sensitivity.
              </p>
              {tableError && (
                <p id='redshift-table-name-error' className='text-destructive text-sm'>
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
