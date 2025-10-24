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
import { useSchemaActualizeTrigger } from '../../../shared/hooks/useSchemaActualizeTrigger';

/**
 * Main component for editing data mart schema settings
 * Uses custom hooks for state management and the SchemaContent component for rendering
 */
export function DataMartSchemaSettings() {
  const { dataMart, updateDataMartSchema, isLoading, error, getDataMart } =
    useOutletContext<DataMartContextType>();

  const initialSchema = dataMart?.schema;

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

  const dataMartId = dataMart?.id ?? '';

  const onActualizeSuccess = useCallback(() => {
    if (!dataMartId) return;
    void getDataMart(dataMartId);
  }, [dataMartId, getDataMart]);

  const { run: runActualize, isLoading: isActualizeLoading } = useSchemaActualizeTrigger(
    dataMartId,
    onActualizeSuccess
  );

  if (!dataMart) {
    return <div>Error: Data mart not found</div>;
  }

  // Handle save
  const handleSave = () => {
    if (dataMartId && schema) {
      startSaveOperation();
      void updateDataMartSchema(dataMartId, schema).then(() => {
        void runActualize();
      });
    }
  };

  // Handle actualize
  const handleActualize = () => {
    void runActualize();
  };

  // Handle discard
  const handleDiscard = () => {
    resetSchema();
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-4'>
        <SchemaContent
          schema={schema}
          storageType={dataMart.storage.type}
          onFieldsChange={handleSchemaFieldsChange}
        />
        <div className='align-items-center mt-8 flex justify-between'>
          <div className='flex space-x-4'>
            <Button variant={'default'} onClick={handleSave} disabled={!isDirty}>
              Save
            </Button>
            <Button type='button' variant='ghost' onClick={handleDiscard} disabled={!isDirty}>
              Discard
            </Button>
          </div>
          <div>
            <Button
              type='button'
              variant='outline'
              onClick={handleActualize}
              disabled={isActualizeLoading}
            >
              Refresh schema
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
