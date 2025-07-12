import { useState, useEffect } from 'react';
import { Button } from '@owox/ui/components/button';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../model/context/types.ts';
import type {
  DataMartSchema,
  BigQuerySchemaField,
  AthenaSchemaField,
} from '../../../shared/types/data-mart-schema.types';
import { BigQuerySchemaTable, AthenaSchemaTable } from './tables';

export function DataMartSchemaSettings() {
  const { dataMart, updateDataMartSchema, actualizeDataMartSchema } =
    useOutletContext<DataMartContextType>();

  if (!dataMart) {
    throw new Error('Data mart not found');
  }

  const { id: dataMartId, schema: initialSchema } = dataMart;

  const [schema, setSchema] = useState<DataMartSchema | null | undefined>(initialSchema);
  const [isDirty, setIsDirty] = useState(false);

  // Reset schema when initialSchema changes
  useEffect(() => {
    setSchema(initialSchema);
    setIsDirty(false);
  }, [initialSchema]);

  // Handle save
  const handleSave = async () => {
    if (dataMartId && schema) {
      try {
        await updateDataMartSchema(dataMartId, schema);
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to update data mart schema:', error);
      }
    }
  };

  // Handle actualize
  const handleActualize = async () => {
    if (dataMartId) {
      try {
        await actualizeDataMartSchema(dataMartId);
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to actualize data mart schema:', error);
      }
    }
  };

  // Handle discard
  const handleDiscard = () => {
    setSchema(initialSchema);
    setIsDirty(false);
  };

  // Handle schema fields change
  const handleSchemaFieldsChange = (newFields: BigQuerySchemaField[] | AthenaSchemaField[]) => {
    if (schema) {
      if (
        schema.type === 'bigquery-data-mart-schema' &&
        newFields.every(field => 'mode' in field)
      ) {
        const updatedSchema = {
          ...schema,
          fields: newFields,
        };
        setSchema(updatedSchema);
        setIsDirty(true);
      } else if (schema.type === 'athena-data-mart-schema') {
        const updatedSchema = {
          ...schema,
          fields: newFields as AthenaSchemaField[],
        };
        setSchema(updatedSchema);
        setIsDirty(true);
      }
    }
  };

  // Render schema content based on schema availability and type
  const renderSchemaContent = () => {
    if (!schema) {
      return (
        <div className='p-4 text-center'>
          <p>No schema available. Click "Actualize" to generate schema.</p>
        </div>
      );
    }

    // Use switch statement to handle different schema types
    switch (schema.type) {
      case 'bigquery-data-mart-schema':
        return (
          <BigQuerySchemaTable fields={schema.fields} onFieldsChange={handleSchemaFieldsChange} />
        );

      case 'athena-data-mart-schema':
        return (
          <AthenaSchemaTable fields={schema.fields} onFieldsChange={handleSchemaFieldsChange} />
        );

      default:
        return (
          <div className='p-4 text-center'>
            <p>Unsupported schema type</p>
          </div>
        );
    }
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-4'>
        {renderSchemaContent()}
        <div className='align-items-center flex justify-start space-x-4'>
          <Button
            variant={'default'}
            onClick={() => {
              void handleSave();
            }}
            disabled={!isDirty}
          >
            Save
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              void handleActualize();
            }}
          >
            Actualize
          </Button>
          <Button type='button' variant='ghost' onClick={handleDiscard} disabled={!isDirty}>
            Discard
          </Button>
        </div>
      </div>
    </div>
  );
}
