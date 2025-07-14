import { Button } from '@owox/ui/components/button';
import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
} from '../../../shared/types/data-mart-schema.types';
import type { DataMartContextType } from '../../model/context/types.ts';
import { useOperationState, useSchemaState } from './hooks';
import { SchemaContent } from './SchemaContent';

/**
 * Main component for editing data mart schema settings
 * Uses custom hooks for state management and the SchemaContent component for rendering
 */
export function DataMartSchemaSettings() {
  const { dataMart, updateDataMartSchema, actualizeDataMartSchema, isLoading, error } =
    useOutletContext<DataMartContextType>();

  if (!dataMart) {
    throw new Error('Data mart not found');
  }

  const { id: dataMartId, schema: initialSchema } = dataMart;

  // Use custom hooks for state management
  const { schema, isDirty, updateSchema, resetSchema } = useSchemaState(initialSchema);

  const { operationStatus, startSaveOperation, startActualizeOperation } = useOperationState(
    isLoading,
    error
  );

  // Reset schema when operation is successful
  useEffect(() => {
    if (operationStatus === 'success') {
      resetSchema();
    }
  }, [operationStatus, resetSchema]);

  // Handle schema fields change
  const handleSchemaFieldsChange = (newFields: BigQuerySchemaField[] | AthenaSchemaField[]) => {
    updateSchema(newFields);
  };

  // Handle save
  const handleSave = () => {
    if (dataMartId && schema) {
      startSaveOperation();
      void updateDataMartSchema(dataMartId, schema);
    }
  };

  // Handle actualize
  const handleActualize = () => {
    if (dataMartId) {
      startActualizeOperation();
      void actualizeDataMartSchema(dataMartId);
    }
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
            <Button type='button' variant='outline' onClick={handleActualize}>
              Actualize schema
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
