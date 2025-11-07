import { Button } from '@owox/ui/components/button';
import { useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
} from '../../../shared/types/data-mart-schema.types';
import type { DataMartContextType } from '../../model/context/types.ts';
import { useOperationState, useSchemaState } from './hooks';
import { SchemaContent } from './SchemaContent';
import type { DataMartDefinitionType } from '../../../shared/index.ts';

interface DataMartSchemaSettingsProps {
  definitionType: DataMartDefinitionType | null;
}
/**
 * Main component for editing data mart schema settings
 * Uses custom hooks for state management and the SchemaContent component for rendering
 */
export function DataMartSchemaSettings({ definitionType }: DataMartSchemaSettingsProps) {
  const {
    dataMart,
    updateDataMartSchema,
    isLoading,
    error,
    runSchemaActualization,
    isSchemaActualizationLoading,
  } = useOutletContext<DataMartContextType>();

  const { id: dataMartId = '', schema: initialSchema } = dataMart ?? {};

  const { schema, isDirty, updateSchema, resetSchema } = useSchemaState(initialSchema);
  const { operationStatus, startSaveOperation } = useOperationState(isLoading, error);

  // Reset schema when operation is successful
  useEffect(() => {
    if (operationStatus === 'success') {
      resetSchema();
    }
  }, [operationStatus, resetSchema]);

  // Handle schema fields change
  const handleSchemaFieldsChange = useCallback(
    (newFields: BigQuerySchemaField[] | AthenaSchemaField[]) => {
      updateSchema(newFields);
    },
    [updateSchema]
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (dataMartId && schema) {
      startSaveOperation();
      void updateDataMartSchema(dataMartId, schema).then(() => {
        void runSchemaActualization?.();
      });
    }
  }, [dataMartId, schema, startSaveOperation, updateDataMartSchema, runSchemaActualization]);

  // Handle actualize
  const handleActualize = useCallback(() => {
    void runSchemaActualization?.();
  }, [runSchemaActualization]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    resetSchema();
  }, [resetSchema]);

  // Disable buttons during schema operations (save or actualization)
  const isSchemaOperationInProgress = isLoading || isSchemaActualizationLoading;

  if (!dataMart) {
    return <div>Error: Data mart not found</div>;
  }

  return (
    <div className='space-y-4'>
      <SchemaContent
        schema={schema}
        storageType={dataMart.storage.type}
        onFieldsChange={handleSchemaFieldsChange}
      />
      <div className='align-items-center mt-8 flex justify-between'>
        <div className='flex space-x-4'>
          <Button
            variant={'default'}
            onClick={handleSave}
            disabled={!isDirty || isSchemaOperationInProgress}
          >
            Save
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={handleDiscard}
            disabled={!isDirty || isSchemaOperationInProgress}
          >
            Discard
          </Button>
        </div>

        <Button
          type='button'
          variant='outline'
          onClick={handleActualize}
          disabled={!definitionType || isSchemaOperationInProgress}
        >
          Refresh schema
        </Button>
      </div>
    </div>
  );
}
