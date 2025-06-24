import { useState, useEffect, useCallback } from 'react';
import { useForm, FormProvider, type SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataMartDefinitionTypeSelector } from './form/DataMartDefinitionTypeSelector.tsx';
import { DataMartDefinitionForm } from './form/DataMartDefinitionForm.tsx';
import { DataMartDefinitionType } from '../../../shared';

import {
  createDataMartDefinitionSchema,
  type DataMartDefinitionFormData,
} from '../../model/schema/data-mart-definition.schema.ts';
import { Button } from '@owox/ui/components/button';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../model/context/types.ts';
import { getEmptyDefinition } from '../../utils/definition-helpers.ts';

export function DataMartDefinitionSettings() {
  const { dataMart, updateDataMartDefinition } = useOutletContext<DataMartContextType>();

  if (!dataMart) {
    throw new Error('Data mart not found');
  }
  const {
    definitionType: initialDefinitionType,
    definition: initialDefinition,
    id: dataMartId,
    storage: { type: storageType },
  } = dataMart;

  const [definitionType, setDefinitionType] = useState<DataMartDefinitionType | null>(
    initialDefinitionType
  );
  const getInitialFormValues = useCallback((): DataMartDefinitionFormData | undefined => {
    if (!definitionType) return undefined;

    const emptyValues = {
      definitionType,
      definition: getEmptyDefinition(definitionType),
    };

    if (!initialDefinition) return emptyValues as DataMartDefinitionFormData;

    return {
      definitionType,
      definition: initialDefinition,
    } as DataMartDefinitionFormData;
  }, [definitionType, initialDefinition]);

  const currentResolver = useCallback((): Resolver<DataMartDefinitionFormData> | undefined => {
    if (!definitionType) return undefined;
    const schema = createDataMartDefinitionSchema(definitionType, storageType);
    return zodResolver(schema) as unknown as Resolver<DataMartDefinitionFormData>;
  }, [definitionType, storageType]);

  const methods = useForm<DataMartDefinitionFormData>({
    resolver: currentResolver(),
    defaultValues: getInitialFormValues(),
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    formState: { isDirty, isValid },
  } = methods;

  useEffect(() => {
    if (definitionType) {
      reset(getInitialFormValues());
    }
  }, [definitionType, reset, getInitialFormValues]);

  const handleTypeSelect = (type: DataMartDefinitionType) => {
    setDefinitionType(type);
  };

  const onSubmit: SubmitHandler<DataMartDefinitionFormData> = async (
    data: DataMartDefinitionFormData
  ) => {
    if (definitionType && dataMartId) {
      try {
        await updateDataMartDefinition(dataMartId, data.definitionType, data.definition);
        reset(data);
      } catch (error) {
        console.error('Failed to update data mart definition:', error);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleSubmit(onSubmit)(e);
  };

  const handleReset = () => {
    reset(getInitialFormValues());
  };

  const renderDefinitionForm = () => {
    if (!definitionType) return null;

    return (
      <form onSubmit={handleFormSubmit} className='space-y-6'>
        <DataMartDefinitionForm definitionType={definitionType} storageType={storageType} />
        <div className='space-y-4'>
          <div className='flex justify-start space-x-4'>
            <Button variant={'secondary'} type='submit' disabled={!isDirty || !isValid}>
              Save
            </Button>
            <Button type='button' variant='ghost' onClick={handleReset} disabled={!isDirty}>
              Discard
            </Button>
          </div>
        </div>
      </form>
    );
  };

  return (
    <FormProvider {...methods}>
      <div className='space-y-6'>
        {!initialDefinitionType && (
          <DataMartDefinitionTypeSelector
            initialType={definitionType}
            onTypeSelect={handleTypeSelect}
          />
        )}
        {renderDefinitionForm()}
      </div>
    </FormProvider>
  );
}
